export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    `SELECT COUNT(*) as count,
            SUM(CASE WHEN tier IS NULL OR tier NOT IN ('donor','waitlist') THEN 1 ELSE 0 END) as generalCount
     FROM subscribers WHERE unsubscribed = 0`
  ).all();

  // Per-tier totals, so the send dialog can state the real number for a
  // single-tier audience instead of borrowing the general count. A NULL or
  // empty tier counts as 'subscriber', matching how newsletter-send.js
  // resolves that audience.
  const { results: tierRows } = await env.SITE_DB.prepare(
    `SELECT COALESCE(NULLIF(tier, ''), 'subscriber') AS tier, COUNT(*) AS n
     FROM subscribers WHERE unsubscribed = 0 GROUP BY 1`
  ).all();
  const byTier = {};
  for (const row of tierRows) byTier[row.tier] = row.n;

  return Response.json({
    // Counts per tier column. Note the Collective audience is derived from
    // the membership table, not from this column, so it is absent here on
    // purpose rather than being a number that would not match the send.
    byTier,
    // Everyone active, for the dashboard headline.
    count: results[0]?.count || 0,
    // Who an "All Subscribers" send actually reaches — donors are a
    // separate list and are excluded from general sends.
    generalCount: results[0]?.generalCount || 0,
  });
}
