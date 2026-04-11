import { requireAdmin } from "../lib/auth.js";

export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env } = context;
  const row = await env.SITE_DB.prepare(
    "SELECT * FROM settings WHERE id = 'main'"
  ).first();

  if (!row) {
    return Response.json({ data: {}, updatedAt: null });
  }

  let data = {};
  try {
    data = JSON.parse(row.data || "{}");
  } catch {
    data = {};
  }

  return Response.json({ ...data, updatedAt: row.updatedAt });
}

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const incoming = await request.json();
  const now = new Date().toISOString();

  // Merge with existing data
  const existing = await env.SITE_DB.prepare(
    "SELECT data FROM settings WHERE id = 'main'"
  ).first();

  let current = {};
  if (existing) {
    try {
      current = JSON.parse(existing.data || "{}");
    } catch {
      current = {};
    }
  }

  const merged = { ...current, ...incoming };

  await env.SITE_DB.prepare(
    "INSERT OR REPLACE INTO settings (id, data, updatedAt) VALUES ('main', ?, ?)"
  ).bind(JSON.stringify(merged), now).run();

  return Response.json({ ok: true, settings: merged });
}
