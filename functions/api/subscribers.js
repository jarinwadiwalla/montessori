import { requireAdmin } from "../lib/auth.js";

export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    "SELECT email, firstName, lastName, subscribedAt, unsubscribed, preferences FROM subscribers ORDER BY subscribedAt DESC"
  ).all();

  return Response.json({ subscribers: results });
}

export async function onRequestDelete(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { email } = await request.json();

  if (!email) {
    return Response.json({ error: "email is required" }, { status: 400 });
  }

  await env.SITE_DB.prepare("DELETE FROM subscribers WHERE email = ?").bind(email).run();

  return Response.json({ success: true, message: "Subscriber removed." });
}
