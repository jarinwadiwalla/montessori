import { requireAdmin } from "../lib/auth.js";

export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    "SELECT * FROM newsletter_templates ORDER BY updatedAt DESC"
  ).all();

  return Response.json({ templates: results });
}

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { id, name, subject, body } = await request.json();

  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const templateId = id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const now = new Date().toISOString();

  await env.SITE_DB.prepare(
    "INSERT OR REPLACE INTO newsletter_templates (id, name, subject, body, updatedAt) VALUES (?, ?, ?, ?, ?)"
  ).bind(templateId, name, subject || "", body || "", now).run();

  return Response.json({ ok: true, id: templateId });
}

export async function onRequestDelete(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { id } = await request.json();

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  await env.SITE_DB.prepare("DELETE FROM newsletter_templates WHERE id = ?").bind(id).run();

  return Response.json({ ok: true });
}
