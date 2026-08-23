// GET    /api/community/posts?page=1   — the feed
// POST   /api/community/posts           — create a post
// DELETE /api/community/posts           — remove a post (author or admin)

import {
  requireMember,
  generateId,
  publicMember,
} from "../../lib/community-auth.js";
import { notifyMentions } from "../../lib/community-mentions.js";

const PAGE_SIZE = 20;
const MAX_BODY = 5000;
const MAX_ATTACHMENTS = 6;
const SPACES = ["general", "say-hello", "announcements"];

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  // No space parameter = the home feed, which shows every space.
  const space = url.searchParams.get("space") || "";
  const filtered = SPACES.includes(space);

  const { results: posts } = await env.SITE_DB.prepare(
    `SELECT p.*, m.name AS author_name, m.avatar_url AS author_avatar,
            m.id AS author_id, m.country AS author_country
     FROM community_posts p
     JOIN community_members m ON m.id = p.member_id
     WHERE p.status = 'visible' ${filtered ? "AND p.space = ?" : ""}
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...(filtered ? [space] : []), PAGE_SIZE + 1, offset)
    .all();

  const hasMore = posts.length > PAGE_SIZE;
  const pagePosts = posts.slice(0, PAGE_SIZE);

  // Fetch attachments for this page in one query.
  let attachmentsByPost = {};
  if (pagePosts.length) {
    const placeholders = pagePosts.map(() => "?").join(",");
    const { results: atts } = await env.SITE_DB.prepare(
      `SELECT * FROM community_attachments WHERE post_id IN (${placeholders}) ORDER BY created_at ASC`
    )
      .bind(...pagePosts.map((p) => p.id))
      .all();

    for (const a of atts) {
      (attachmentsByPost[a.post_id] ||= []).push({
        id: a.id,
        kind: a.kind,
        url: a.url,
        filename: a.filename,
        size: a.size,
      });
    }
  }

  return Response.json({
    posts: pagePosts.map((p) => ({
      id: p.id,
      body: p.body,
      created_at: p.created_at,
      comment_count: p.comment_count || 0,
      space: p.space || "general",
      author: {
        id: p.author_id,
        name: p.author_name || "Member",
        avatar_url: p.author_avatar || "",
        country: p.author_country || "",
      },
      attachments: attachmentsByPost[p.id] || [],
      can_delete: p.member_id === member.id || member.role === "admin",
    })),
    page,
    hasMore,
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

  const body = String(payload.body || "").trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const space = SPACES.includes(payload.space) ? payload.space : "general";

  // Announcements come from the team, not the floor.
  if (space === "announcements" && member.role !== "admin") {
    return Response.json(
      { error: "Only admins can post announcements." },
      { status: 403 }
    );
  }

  if (!body && attachments.length === 0) {
    return Response.json(
      { error: "Add a message or an attachment before posting." },
      { status: 400 }
    );
  }
  if (body.length > MAX_BODY) {
    return Response.json(
      { error: `Posts are limited to ${MAX_BODY} characters.` },
      { status: 400 }
    );
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    return Response.json(
      { error: `You can attach up to ${MAX_ATTACHMENTS} items.` },
      { status: 400 }
    );
  }

  // Light rate limit: 10 posts per member per 10 minutes.
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS count FROM community_posts WHERE member_id = ? AND created_at > ?"
  )
    .bind(member.id, windowStart)
    .first();
  if ((recent?.count || 0) >= 10) {
    return Response.json(
      { error: "You're posting quickly — please wait a moment before posting again." },
      { status: 429 }
    );
  }

  // Validate attachments before writing anything.
  const prepared = [];
  for (const a of attachments) {
    const kind = String(a.kind || "");
    if (kind === "video") {
      const embed = toVideoEmbed(String(a.url || ""));
      if (!embed) {
        return Response.json(
          { error: "Video links must be from YouTube or Vimeo." },
          { status: 400 }
        );
      }
      prepared.push({ kind: "video", url: embed, filename: "", size: 0, r2_key: "" });
    } else if (kind === "image" || kind === "pdf") {
      const url = String(a.url || "");
      if (!url.startsWith("/community-media/community/")) {
        return Response.json({ error: "That attachment isn't valid." }, { status: 400 });
      }
      prepared.push({
        kind,
        url,
        filename: String(a.filename || "").slice(0, 120),
        size: Number(a.size) || 0,
        r2_key: String(a.r2_key || "").slice(0, 300),
      });
    } else {
      return Response.json({ error: "Unsupported attachment type." }, { status: 400 });
    }
  }

  const id = generateId("post_");
  const now = new Date().toISOString();

  await env.SITE_DB.prepare(
    `INSERT INTO community_posts (id, member_id, body, status, comment_count, space, created_at, updated_at)
     VALUES (?, ?, ?, 'visible', 0, ?, ?, ?)`
  )
    .bind(id, member.id, body, space, now, now)
    .run();

  for (const a of prepared) {
    await env.SITE_DB.prepare(
      `INSERT INTO community_attachments (id, post_id, kind, url, filename, size, r2_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(generateId("att_"), id, a.kind, a.url, a.filename, a.size, a.r2_key, now)
      .run();
  }

  await notifyMentions(context, { text: body, author: member, kind: "post", postId: id });

  return Response.json({
    ok: true,
    post: {
      id,
      body,
      created_at: now,
      comment_count: 0,
      author: publicMember(member),
      attachments: prepared.map((a) => ({ ...a })),
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
  if (!id) return Response.json({ error: "Missing post id." }, { status: 400 });

  const post = await env.SITE_DB.prepare(
    "SELECT * FROM community_posts WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!post) return Response.json({ error: "Post not found." }, { status: 404 });

  const isAuthor = post.member_id === member.id;
  const isAdmin = member.role === "admin";
  if (!isAuthor && !isAdmin) {
    return Response.json({ error: "You can't remove that post." }, { status: 403 });
  }

  // Soft-delete the post so moderation history is preserved, but purge
  // the uploaded files from storage.
  const { results: atts } = await env.SITE_DB.prepare(
    "SELECT r2_key FROM community_attachments WHERE post_id = ? AND r2_key != ''"
  )
    .bind(id)
    .all();

  if (env.MEDIA_BUCKET) {
    for (const a of atts) {
      context.waitUntil(env.MEDIA_BUCKET.delete(a.r2_key).catch(() => {}));
    }
  }

  await env.SITE_DB.prepare(
    "UPDATE community_posts SET status = 'removed', removed_reason = ?, updated_at = ? WHERE id = ?"
  )
    .bind(isAdmin && !isAuthor ? "removed by moderator" : "removed by author", new Date().toISOString(), id)
    .run();

  return Response.json({ ok: true });
}

// Accepts a YouTube or Vimeo watch URL and returns a privacy-friendly
// embed URL. Anything else returns null.
function toVideoEmbed(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;

  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{6,20}$/.test(v)) return `https://www.youtube-nocookie.com/embed/${v}`;
    const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,20})$/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    return null;
  }
  if (host === "youtu.be") {
    const m = u.pathname.match(/^\/([\w-]{6,20})$/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    return null;
  }
  if (host === "vimeo.com") {
    const m = u.pathname.match(/^\/(\d{6,12})/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return null;
  }
  if (host === "player.vimeo.com") {
    const m = u.pathname.match(/^\/video\/(\d{6,12})$/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return null;
  }
  return null;
}
