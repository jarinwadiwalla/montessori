import { requireAdmin } from "../lib/auth.js";

export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter");

  let query = "SELECT email, firstName, lastName, subscribedAt, unsubscribed, unsubscribedAt, resubscribedAt, preferences, tier FROM subscribers";
  const conditions = [];

  if (filter === "unsubscribed") {
    conditions.push("unsubscribed = 1");
  } else if (filter === "founding") {
    conditions.push("tier = 'founding'");
  } else if (filter === "active") {
    conditions.push("unsubscribed = 0");
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY subscribedAt DESC";

  const { results } = await env.SITE_DB.prepare(query).all();

  // Counts for the dashboard
  const { results: countResults } = await env.SITE_DB.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN unsubscribed = 0 THEN 1 ELSE 0 END) as active, SUM(CASE WHEN unsubscribed = 1 THEN 1 ELSE 0 END) as unsubscribed, SUM(CASE WHEN tier = 'founding' THEN 1 ELSE 0 END) as founding FROM subscribers"
  ).all();

  return Response.json({
    subscribers: results,
    counts: countResults[0] || { total: 0, active: 0, unsubscribed: 0, founding: 0 },
  });
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
