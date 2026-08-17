// GET /api/community/notifications  — my alerts, newest first
// PUT /api/community/notifications  — mark one, or all, as read
//
// In-app rather than email, so a busy thread doesn't fill anyone's inbox.

import { requireMember } from "../../lib/community-auth.js";

const PAGE_SIZE = 50;

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;

  const { results } = await env.SITE_DB.prepare(
    `SELECT id, kind, actor_name, post_id, excerpt, read_at, created_at
     FROM community_notifications
     WHERE member_id = ?
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(member.id, PAGE_SIZE)
    .all();

  const unread = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_notifications WHERE member_id = ? AND read_at = ''"
  )
    .bind(member.id)
    .first();

  return Response.json({
    unread: unread?.n || 0,
    notifications: results.map((n) => ({
      id: n.id,
      kind: n.kind,
      actor_name: n.actor_name || "A member",
      post_id: n.post_id || "",
      excerpt: n.excerpt || "",
      read: !!n.read_at,
      created_at: n.created_at,
    })),
  });
}

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

  const now = new Date().toISOString();

  if (payload.all) {
    await env.SITE_DB.prepare(
      "UPDATE community_notifications SET read_at = ? WHERE member_id = ? AND read_at = ''"
    )
      .bind(now, member.id)
      .run();
    return Response.json({ ok: true, unread: 0 });
  }

  const id = String(payload.id || "");
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 });

  // Scoped to this member, so nobody can mark someone else's alerts read.
  await env.SITE_DB.prepare(
    "UPDATE community_notifications SET read_at = ? WHERE id = ? AND member_id = ? AND read_at = ''"
  )
    .bind(now, id, member.id)
    .run();

  const unread = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_notifications WHERE member_id = ? AND read_at = ''"
  )
    .bind(member.id)
    .first();

  return Response.json({ ok: true, unread: unread?.n || 0 });
}
