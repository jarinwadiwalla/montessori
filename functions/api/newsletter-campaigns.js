import { requireAdmin } from "../lib/auth.js";

export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    "SELECT * FROM campaigns ORDER BY sentAt DESC"
  ).all();

  return Response.json({ campaigns: results });
}
