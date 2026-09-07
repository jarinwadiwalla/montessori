// POST /api/community/reactions  { post_id }
//
// Toggles a heart on a post: hearting again takes it back. One heart per
// member per post, enforced by the table's composite primary key rather
// than by checking first, so a double-tap or a retried request can't
// inflate the count.

import { requireMember } from "../../lib/community-auth.js";

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const postId = String(payload.post_id || "");
  if (!postId) return Response.json({ error: "Invalid request." }, { status: 400 });

  const post = await env.SITE_DB.prepare(
    "SELECT id FROM community_posts WHERE id = ? AND status = 'visible'"
  ).bind(postId).first();
  if (!post) return Response.json({ error: "Not found." }, { status: 404 });

  const existing = await env.SITE_DB.prepare(
    "SELECT 1 AS n FROM community_reactions WHERE post_id = ? AND member_id = ?"
  ).bind(postId, member.id).first();

  if (existing) {
    await env.SITE_DB.prepare(
      "DELETE FROM community_reactions WHERE post_id = ? AND member_id = ?"
    ).bind(postId, member.id).run();
  } else {
    await env.SITE_DB.prepare(
      `INSERT OR IGNORE INTO community_reactions (post_id, member_id, created_at)
       VALUES (?, ?, ?)`
    ).bind(postId, member.id, new Date().toISOString()).run();
  }

  const count = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_reactions WHERE post_id = ?"
  ).bind(postId).first();

  return Response.json({
    ok: true,
    hearted: !existing,
    hearts: count?.n || 0,
  });
}
