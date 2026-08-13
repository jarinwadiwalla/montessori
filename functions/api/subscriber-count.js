export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    `SELECT COUNT(*) as count,
            SUM(CASE WHEN tier IS NULL OR tier != 'donor' THEN 1 ELSE 0 END) as generalCount
     FROM subscribers WHERE unsubscribed = 0`
  ).all();

  return Response.json({
    // Everyone active, for the dashboard headline.
    count: results[0]?.count || 0,
    // Who an "All Subscribers" send actually reaches — donors are a
    // separate list and are excluded from general sends.
    generalCount: results[0]?.generalCount || 0,
  });
}
