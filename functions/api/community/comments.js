// GET    /api/community/comments?post_id=... — comments on a post
// POST   /api/community/comments             — add a comment
// DELETE /api/community/comments             — remove one (author or admin)

import { requireMember, generateId } from "../../lib/community-auth.js";
import { notifyMentions } from "../../lib/community-mentions.js";

const MAX_BODY = 3000;

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const postId = new URL(request.url).searchParams.get("post_id");
  if (!postId) {
    return Response.json({ error: "Missing post_id." }, { status: 400 });
  }

  const { results } = await env.SITE_DB.prepare(
    `SELECT c.*, m.name AS author_name, m.avatar_url AS author_avatar, m.country AS author_country
     FROM community_comments c
     JOIN community_members m ON m.id = c.member_id
     WHERE c.post_id = ? AND c.status = 'visible'
     ORDER BY c.created_at ASC`
  )
    .bind(postId)
    .all();

  return Response.json({
    comments: results.map((c) => ({
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      author: {
        id: c.member_id,
        name: c.author_name || "Member",
        avatar_url: c.author_avatar || "",
        country: c.author_country || "",
      },
      can_delete: c.member_id === member.id || member.role === "admin",
    })),
  });
}

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

  const postId = String(payload.post_id || "");
  const body = String(payload.body || "").trim();

  if (!postId || !body) {
    return Response.json({ error: "Write something before posting." }, { status: 400 });
  }
  if (body.length > MAX_BODY) {
    return Response.json(
      { error: `Comments are limited to ${MAX_BODY} characters.` },
      { status: 400 }
    );
  }

  const post = await env.SITE_DB.prepare(
    "SELECT id, status FROM community_posts WHERE id = ?"
  )
    .bind(postId)
    .first();

  if (!post || post.status !== "visible") {
    return Response.json({ error: "That post is no longer available." }, { status: 404 });
  }

  // Rate limit: 20 comments per member per 10 minutes.
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS count FROM community_comments WHERE member_id = ? AND created_at > ?"
  )
    .bind(member.id, windowStart)
    .first();
  if ((recent?.count || 0) >= 20) {
    return Response.json(
      { error: "You're commenting quickly — please wait a moment." },
      { status: 429 }
    );
  }

  const id = generateId("cmt_");
  const now = new Date().toISOString();

  await env.SITE_DB.prepare(
    `INSERT INTO community_comments (id, post_id, member_id, body, status, created_at)
     VALUES (?, ?, ?, ?, 'visible', ?)`
  )
    .bind(id, postId, member.id, body, now)
    .run();

  await env.SITE_DB.prepare(
    "UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = ?"
  )
    .bind(postId)
    .run();

  await notifyMentions(context, { text: body, author: member, kind: "comment", postId });

  return Response.json({
    ok: true,
    comment: {
      id,
      body,
      created_at: now,
      author: {
        id: member.id,
        name: member.name || "Member",
        avatar_url: member.avatar_url || "",
      },
      can_delete: true,
    },
  });
}

export async function onRequestDelete(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const id = String(payload.id || "");
  if (!id) return Response.json({ error: "Missing comment id." }, { status: 400 });

  const comment = await env.SITE_DB.prepare(
    "SELECT * FROM community_comments WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!comment) return Response.json({ error: "Comment not found." }, { status: 404 });

  if (comment.member_id !== member.id && member.role !== "admin") {
    return Response.json({ error: "You can't remove that comment." }, { status: 403 });
  }

  await env.SITE_DB.prepare(
    "UPDATE community_comments SET status = 'removed' WHERE id = ?"
  )
    .bind(id)
    .run();

  await env.SITE_DB.prepare(
    "UPDATE community_posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?"
  )
    .bind(comment.post_id)
    .run();

  return Response.json({ ok: true });
}
