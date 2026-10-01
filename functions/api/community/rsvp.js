// POST   /api/community/rsvp  { event_id }  — I'm coming
// DELETE /api/community/rsvp  { event_id }  — actually, I'm not

import { requireMember } from "../../lib/community-auth.js";
import { getTemplate, renderTemplate, greetingName } from "../../lib/email-templates.js";

const SITE = "https://montessoriforadolescents.com";
const FROM = "Montessori Adolescent Collective <newsletter@montessoriforadolescents.com>";

// "Sunday 4 October, 13:00 UTC" — built from the stored instant rather than
// typed, so it can never drift from what the event actually says.
function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return `${date}, ${time} UTC`;
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Confirmation is best-effort: the RSVP is already recorded, and losing the
// email is recoverable where losing the booking is not.
async function sendRsvpEmail(env, member, event) {
  if (!env.RESEND_API_KEY) return;
  try {
    const tpl = await getTemplate(env, "event-rsvp");

    const when = formatWhen(event.starts_at);
    const whenBlock =
      `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">` +
      `<tr><td style="background:#EEE4DB;border-left:4px solid #D0905B;border-radius:0 8px 8px 0;padding:18px 22px;">` +
      `<p style="margin:0;color:#3E312A;font-size:18px;">${esc(when)}</p>` +
      (event.timezone_note
        ? `<p style="margin:8px 0 0;color:#4A3F35;font-size:15px;">${esc(event.timezone_note)}</p>`
        : "") +
      `</td></tr></table>`;

    // Eleven of the twelve gatherings have no link yet. Promise one rather
    // than rendering a dead button.
    const joinBlock = event.link
      ? `<p style="margin:28px 0;"><a href="${esc(event.link)}" style="background:#3f265b;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">Join the gathering</a></p>` +
        `<p style="color:#6b5b7d;font-size:14px;">Or paste this into your browser:<br>` +
        `<a href="${esc(event.link)}" style="color:#3f265b;word-break:break-all;">${esc(event.link)}</a></p>`
      : `<p>We will email you the joining link before we meet.</p>`;

    const { subject, html } = renderTemplate(
      tpl,
      { greeting_name: greetingName(member.name), event_title: event.title, event_when: when, site: SITE },
      { when_block: whenBlock, join_block: joinBlock }
    );

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [member.email], subject, html }),
    });
  } catch (err) {
    console.error("rsvp confirmation failed", err);
  }
}

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const payload = await safeJson(request);
  const eventId = String(payload?.event_id || "");
  if (!eventId) return Response.json({ error: "Missing event id." }, { status: 400 });

  const event = await env.SITE_DB.prepare(
    "SELECT id, capacity, status, title, starts_at, timezone_note, link FROM community_events WHERE id = ?"
  )
    .bind(eventId)
    .first();

  if (!event || event.status !== "visible") {
    return Response.json({ error: "That event is no longer open." }, { status: 404 });
  }

  // Respect capacity, but never block someone already on the list.
  if (event.capacity > 0) {
    const existing = await env.SITE_DB.prepare(
      "SELECT 1 AS x FROM community_event_rsvps WHERE event_id = ? AND member_id = ?"
    )
      .bind(eventId, member.id)
      .first();

    if (!existing) {
      const row = await env.SITE_DB.prepare(
        "SELECT COUNT(*) AS n FROM community_event_rsvps WHERE event_id = ?"
      )
        .bind(eventId)
        .first();
      if ((row?.n || 0) >= event.capacity) {
        return Response.json({ error: "This event is full." }, { status: 409 });
      }
    }
  }

  const insert = await env.SITE_DB.prepare(
    `INSERT INTO community_event_rsvps (event_id, member_id, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(event_id, member_id) DO NOTHING`
  )
    .bind(eventId, member.id, new Date().toISOString())
    .run();

  // changes === 0 means they were already on the list, so pressing the
  // button again does not send a second confirmation.
  if (insert?.meta?.changes > 0) {
    await sendRsvpEmail(env, member, event);
  }

  const count = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_event_rsvps WHERE event_id = ?"
  )
    .bind(eventId)
    .first();

  return Response.json({ ok: true, going: true, rsvp_count: count?.n || 0 });
}

export async function onRequestDelete(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const payload = await safeJson(request);
  const eventId = String(payload?.event_id || "");
  if (!eventId) return Response.json({ error: "Missing event id." }, { status: 400 });

  await env.SITE_DB.prepare(
    "DELETE FROM community_event_rsvps WHERE event_id = ? AND member_id = ?"
  )
    .bind(eventId, member.id)
    .run();

  const count = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_event_rsvps WHERE event_id = ?"
  )
    .bind(eventId)
    .first();

  return Response.json({ ok: true, going: false, rsvp_count: count?.n || 0 });
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
