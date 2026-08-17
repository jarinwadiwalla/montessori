// Keeping Collective members reachable by email.
//
// The "Collective Members Only" newsletter audience is derived live from
// community_members, so it is always accurate. But unsubscribes live in the
// subscribers table, and so does the unsubscribe link machinery — so every
// member needs a row there too.
//
// Deliberately never downgrades an existing subscriber: someone who was
// already on the list as 'founding' or 'donor' keeps that tier.

export async function ensureSubscriber(env, email, name = "") {
  if (!env?.SITE_DB || !email) return;

  const existing = await env.SITE_DB.prepare(
    "SELECT email FROM subscribers WHERE email = ?"
  )
    .bind(email)
    .first();

  if (existing) return;

  const parts = String(name).trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";

  await env.SITE_DB.prepare(
    `INSERT INTO subscribers (email, firstName, lastName, subscribedAt, unsubscribed, preferences, tier)
     VALUES (?, ?, ?, ?, 0, 'all', 'collective')
     ON CONFLICT(email) DO NOTHING`
  )
    .bind(email, firstName, lastName, new Date().toISOString())
    .run();
}
