export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    "SELECT COUNT(*) as count FROM subscribers WHERE unsubscribed = 0"
  ).all();

  return Response.json({ count: results[0]?.count || 0 });
}
