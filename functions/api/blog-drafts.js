import { requireAdmin } from "../lib/auth.js";

export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    "SELECT * FROM blog_drafts ORDER BY updatedAt DESC"
  ).all();

  return Response.json({ drafts: results });
}

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { draft } = await request.json();

  if (!draft || !draft.slug || !draft.title) {
    return Response.json({ error: "slug and title are required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  await env.SITE_DB.prepare(
    `INSERT OR REPLACE INTO blog_drafts (slug, title, date, author, description, image, body, featured, scheduledAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    draft.slug,
    draft.title,
    draft.date || new Date().toISOString().split("T")[0],
    draft.author || "Jarin Wadiwalla",
    draft.description || "",
    draft.image || "",
    draft.body || "",
    draft.featured ? 1 : 0,
    draft.scheduledAt || null,
    now
  ).run();

  return Response.json({ ok: true, slug: draft.slug });
}

export async function onRequestDelete(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { slug } = await request.json();

  if (!slug) {
    return Response.json({ error: "slug is required" }, { status: 400 });
  }

  await env.SITE_DB.prepare("DELETE FROM blog_drafts WHERE slug = ?").bind(slug).run();

  return Response.json({ ok: true });
}
