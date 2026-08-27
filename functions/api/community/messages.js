// Direct messages between members.
//
//   GET  /api/community/messages                    — my conversations
//   GET  /api/community/messages?conversation=<id>  — one thread, marks it read
//   GET  /api/community/messages?with=<member_id>   — thread with a person,
//                                                     whether or not it exists
//   POST /api/community/messages  { to, body }      — send
//   PUT  /api/community/messages  { action, member_id }  — mute / unmute
//
// Messages are private: no admin endpoint reads them. A member who needs
// help reports the conversation (target_type 'conversation' in report.js),
// which is the only thing that surfaces a thread to the team.

import {
  requireMember,
  publicMember,
  generateId,
} from "../../lib/community-auth.js";
import {
  ensureConversation,
  findConversation,
  hasMuted,
  isUnread,
  otherId,
  sideOf,
} from "../../lib/community-messages.js";
import { getTemplate, renderTemplate, greetingName } from "../../lib/email-templates.js";

const SITE = "https://montessoriforadolescents.com";
const FROM = "The Collective <hello@montessoriforadolescents.com>";
const MAX_BODY = 5000;

// --- read ------------------------------------------------------

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversation");
  const withMember = url.searchParams.get("with");

  if (conversationId || withMember) {
    return thread(env, member, { conversationId, withMember });
  }
  return conversationList(env, member);
}

async function conversationList(env, member) {
  const { results } = await env.SITE_DB.prepare(
    `SELECT * FROM community_conversations
     WHERE (member_a = ? OR member_b = ?) AND last_sender_id != ''
     ORDER BY last_message_at DESC
     LIMIT 100`
  )
    .bind(member.id, member.id)
    .all();

  const rows = results || [];
  const others = await membersByIds(
    env,
    rows.map((c) => otherId(c, member.id))
  );

  return Response.json({
    conversations: rows.map((c) => ({
      id: c.id,
      with: others[otherId(c, member.id)] || null,
      last_excerpt: c.last_excerpt || "",
      last_message_at: c.last_message_at,
      last_was_mine: c.last_sender_id === member.id,
      unread: isUnread(c, member.id),
    })),
  });
}

async function thread(env, member, { conversationId, withMember }) {
  let conversation = null;

  if (conversationId) {
    conversation = await env.SITE_DB.prepare(
      "SELECT * FROM community_conversations WHERE id = ?"
    )
      .bind(conversationId)
      .first();
    // Only the two participants can read it.
    if (
      !conversation ||
      (conversation.member_a !== member.id && conversation.member_b !== member.id)
    ) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
  } else {
    if (withMember === member.id) {
      return Response.json({ error: "You can't message yourself." }, { status: 400 });
    }
    conversation = await findConversation(env, member.id, withMember);
  }

  const otherMemberId = conversation
    ? otherId(conversation, member.id)
    : withMember;

  const other = await env.SITE_DB.prepare(
    "SELECT * FROM community_members WHERE id = ? AND status = 'active'"
  )
    .bind(otherMemberId)
    .first();
  if (!other) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let messages = [];
  if (conversation) {
    const { results } = await env.SITE_DB.prepare(
      `SELECT id, sender_id, body, created_at FROM community_messages
       WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500`
    )
      .bind(conversation.id)
      .all();
    messages = (results || []).map((m) => ({
      id: m.id,
      body: m.body,
      created_at: m.created_at,
      mine: m.sender_id === member.id,
    }));

    // Opening a thread marks it read for this side.
    const col = sideOf(conversation, member.id) === "a" ? "a_last_read_at" : "b_last_read_at";
    await env.SITE_DB.prepare(
      `UPDATE community_conversations SET ${col} = ? WHERE id = ?`
    )
      .bind(new Date().toISOString(), conversation.id)
      .run();
  }

  return Response.json({
    conversation_id: conversation?.id || "",
    with: publicMember(other),
    messages,
    // Whether I have muted them — drives the button label.
    muted: await hasMuted(env, member.id, other.id),
  });
}

// --- send ------------------------------------------------------

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const to = String(payload.to || "");
  const body = String(payload.body || "").trim().slice(0, MAX_BODY);

  if (!to || !body) {
    return Response.json({ error: "Write a message first." }, { status: 400 });
  }
  if (to === member.id) {
    return Response.json({ error: "You can't message yourself." }, { status: 400 });
  }

  const recipient = await env.SITE_DB.prepare(
    "SELECT * FROM community_members WHERE id = ? AND status = 'active'"
  )
    .bind(to)
    .first();
  if (!recipient) {
    return Response.json({ error: "That member isn't available." }, { status: 404 });
  }

  // If they've muted me, accept the request and do nothing. Telling the
  // sender would turn a quiet exit into a confrontation.
  if (await hasMuted(env, recipient.id, member.id)) {
    return Response.json({ ok: true });
  }

  const conversation = await ensureConversation(env, member.id, recipient.id);
  if (!conversation) {
    return Response.json({ error: "That didn't send — please try again." }, { status: 500 });
  }

  const now = new Date().toISOString();
  const isFirst = !conversation.last_sender_id;

  await env.SITE_DB.prepare(
    `INSERT INTO community_messages (id, conversation_id, sender_id, body, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(generateId("msg_"), conversation.id, member.id, body, now)
    .run();

  // Denormalise onto the conversation, and mark it read for the sender —
  // your own message should never come back as unread for you.
  const myCol = sideOf(conversation, member.id) === "a" ? "a_last_read_at" : "b_last_read_at";
  await env.SITE_DB.prepare(
    `UPDATE community_conversations
     SET last_message_at = ?, last_sender_id = ?, last_excerpt = ?, ${myCol} = ?
     WHERE id = ?`
  )
    .bind(now, member.id, body.slice(0, 140), now, conversation.id)
    .run();

  // Email only when a thread is new, or when they've read everything so far.
  // A back-and-forth conversation should not email on every line.
  if (isFirst || !isUnread(conversation, recipient.id)) {
    context.waitUntil(notify(context, member, recipient, body));
  }

  return Response.json({ ok: true, conversation_id: conversation.id });
}

// --- mute ------------------------------------------------------

export async function onRequestPut(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = String(payload.action || "");
  const memberId = String(payload.member_id || "");
  if (!memberId || !["mute", "unmute"].includes(action)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (action === "mute") {
    await env.SITE_DB.prepare(
      `INSERT OR IGNORE INTO community_mutes (member_id, muted_id, created_at)
       VALUES (?, ?, ?)`
    )
      .bind(member.id, memberId, new Date().toISOString())
      .run();
  } else {
    await env.SITE_DB.prepare(
      "DELETE FROM community_mutes WHERE member_id = ? AND muted_id = ?"
    )
      .bind(member.id, memberId)
      .run();
  }

  return Response.json({ ok: true, muted: action === "mute" });
}

// --- helpers ---------------------------------------------------

async function membersByIds(env, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const placeholders = unique.map(() => "?").join(",");
  const { results } = await env.SITE_DB.prepare(
    `SELECT * FROM community_members WHERE id IN (${placeholders})`
  )
    .bind(...unique)
    .all();
  const map = {};
  for (const m of results || []) map[m.id] = publicMember(m);
  return map;
}

async function notify(context, sender, recipient, body) {
  const { env } = context;
  if (!env.RESEND_API_KEY) return;

  try {
    const tpl = await getTemplate(env, "member-new-message");
    const { subject, html } = renderTemplate(tpl, {
      greeting_name: greetingName(recipient.name),
      sender_name: sender.name || "A member",
      excerpt: body.slice(0, 200),
      link: `${SITE}/collective/messages/`,
      site: SITE,
    });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [recipient.email], subject, html }),
    });
  } catch {
    // A failed notification must never fail the send.
  }
}
