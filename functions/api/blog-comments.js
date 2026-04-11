import { requireAdmin } from "../lib/auth.js";

async function md5Hash(str) {
  const data = new TextEncoder().encode(str.trim().toLowerCase());
  const hash = await crypto.subtle.digest("MD5", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

// Public: GET approved comments for a post
// Admin: GET all comments with moderation
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const admin = url.searchParams.get("admin");

  if (admin === "1") {
    const authErr = requireAdmin(context);
    if (authErr) return authErr;

    const status = url.searchParams.get("status") || "pending";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = 50;
    const offset = (page - 1) * limit;

    let query, params;
    if (status === "all") {
      query = "SELECT * FROM blog_comments ORDER BY createdAt DESC LIMIT ? OFFSET ?";
      params = [limit, offset];
    } else {
      query = "SELECT * FROM blog_comments WHERE status = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?";
      params = [status, limit, offset];
    }

    const { results } = await env.SITE_DB.prepare(query).bind(...params).all();

    const { results: countResults } = await env.SITE_DB.prepare(
      "SELECT COUNT(*) as count FROM blog_comments WHERE status = 'pending'"
    ).all();
    const pendingCount = countResults[0]?.count || 0;

    return Response.json({ comments: results, pending_count: pendingCount });
  }

  // Public: approved comments for a slug
  if (!slug) {
    return Response.json({ error: "slug parameter required" }, { status: 400 });
  }

  const { results } = await env.SITE_DB.prepare(
    "SELECT id, slug, parent_id, author_name, email_hash, body, createdAt FROM blog_comments WHERE slug = ? AND status = 'approved' ORDER BY createdAt ASC"
  ).bind(slug).all();

  // Thread comments
  const topLevel = results.filter((c) => !c.parent_id);
  const replies = results.filter((c) => c.parent_id);
  const threaded = topLevel.map((c) => ({
    ...c,
    replies: replies.filter((r) => r.parent_id === c.id),
  }));

  return Response.json({ comments: threaded, count: results.length });
}

// Public: submit a comment
export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json();
  const { slug, author_name, author_email, body: commentBody, parent_id, notify_replies } = body;

  if (!slug || !author_name || !author_email || !commentBody) {
    return Response.json({ error: "slug, author_name, author_email, and body are required" }, { status: 400 });
  }

  if (author_name.length > 100 || author_email.length > 200) {
    return Response.json({ error: "Name or email too long" }, { status: 400 });
  }

  if (commentBody.length > 5000) {
    return Response.json({ error: "Comment too long. Max 5000 characters." }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(author_email)) {
    return Response.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Rate limit: max 3 comments per IP per 10 minutes
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { results: recentComments } = await env.SITE_DB.prepare(
    "SELECT COUNT(*) as count FROM blog_comments WHERE ip_address = ? AND createdAt > ?"
  ).bind(ip, tenMinAgo).all();

  if (recentComments[0]?.count >= 3) {
    return Response.json({ error: "Too many comments. Please wait a few minutes." }, { status: 429 });
  }

  // If reply, verify parent exists and is top-level (1-level nesting only)
  if (parent_id) {
    const parent = await env.SITE_DB.prepare(
      "SELECT id, parent_id FROM blog_comments WHERE id = ? AND slug = ?"
    ).bind(parent_id, slug).first();

    if (!parent) {
      return Response.json({ error: "Parent comment not found" }, { status: 400 });
    }
    if (parent.parent_id) {
      return Response.json({ error: "Replies to replies are not supported" }, { status: 400 });
    }
  }

  const id = generateId();
  const now = new Date().toISOString();
  const emailHash = await md5Hash(author_email);
  const userAgent = request.headers.get("User-Agent") || "";

  await env.SITE_DB.prepare(
    `INSERT INTO blog_comments (id, slug, parent_id, author_name, author_email, email_hash, body, status, notify_replies, ip_address, user_agent, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
  ).bind(
    id, slug, parent_id || "", author_name, author_email, emailHash,
    commentBody, notify_replies ? 1 : 0, ip, userAgent, now, now
  ).run();

  // Send admin notification (fire and forget)
  if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
    context.waitUntil(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
          to: [env.ADMIN_EMAIL],
          subject: `New comment on "${slug}" from ${author_name}`,
          html: `<p><strong>${author_name}</strong> (${author_email}) commented on <a href="https://montessoriforadolescents.com/blog/${slug}/">${slug}</a>:</p><blockquote>${commentBody}</blockquote><p><a href="https://montessoriforadolescents.com/guru/#comments">Moderate in Guru</a></p>`,
        }),
      }).catch(() => {})
    );
  }

  return Response.json({
    success: true,
    comment: { id, status: "pending" },
    message: "Your comment has been submitted and is awaiting approval.",
  });
}

// Admin: approve or reject
export async function onRequestPut(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { id, status } = await request.json();

  if (!id || !["approved", "rejected"].includes(status)) {
    return Response.json({ error: "id and status (approved/rejected) required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.SITE_DB.prepare(
    "UPDATE blog_comments SET status = ?, updatedAt = ? WHERE id = ?"
  ).bind(status, now, id).run();

  // If approving a reply and parent author opted for notifications, send email
  if (status === "approved" && env.RESEND_API_KEY) {
    const comment = await env.SITE_DB.prepare(
      "SELECT * FROM blog_comments WHERE id = ?"
    ).bind(id).first();

    if (comment && comment.parent_id) {
      const parent = await env.SITE_DB.prepare(
        "SELECT * FROM blog_comments WHERE id = ? AND notify_replies = 1"
      ).bind(comment.parent_id).first();

      if (parent) {
        context.waitUntil(
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
              to: [parent.author_email],
              subject: `${comment.author_name} replied to your comment`,
              html: `<p><strong>${comment.author_name}</strong> replied to your comment on <a href="https://montessoriforadolescents.com/blog/${comment.slug}/#comment-${comment.id}">this post</a>:</p><blockquote>${comment.body}</blockquote>`,
            }),
          }).catch(() => {})
        );
      }
    }
  }

  return Response.json({ ok: true });
}

// Admin: delete comment (cascades to replies)
export async function onRequestDelete(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { id } = await request.json();

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  // Delete replies first
  await env.SITE_DB.prepare("DELETE FROM blog_comments WHERE parent_id = ?").bind(id).run();
  await env.SITE_DB.prepare("DELETE FROM blog_comments WHERE id = ?").bind(id).run();

  return Response.json({ ok: true });
}
