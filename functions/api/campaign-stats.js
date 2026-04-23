import { requireAdmin } from "../lib/auth.js";

const EVENT_PRIORITY = { complained: 6, clicked: 5, opened: 4, delivered: 3, bounced: 2, sent: 1, queued: 0 };
const DELIVERED_EVENTS = new Set(["delivered", "opened", "clicked"]);

export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const url = new URL(request.url);
  const campaignId = url.searchParams.get("id");

  if (!campaignId) {
    return Response.json({ error: "id parameter required" }, { status: 400 });
  }

  const campaign = await env.SITE_DB.prepare(
    "SELECT * FROM campaigns WHERE id = ?"
  ).bind(campaignId).first();

  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const emailIds = JSON.parse(campaign.emailIds || "[]");
  if (emailIds.length === 0) {
    return Response.json({
      success: true,
      stats: { total: campaign.totalSent, delivered: 0, clicked: 0, bounced: 0, complained: 0 },
      eventDetails: [],
    });
  }

  const stats = { total: emailIds.length, delivered: 0, clicked: 0, bounced: 0, complained: 0 };
  const eventDetails = [];
  let webhookHits = 0;
  let apiHits = 0;
  let apiErrors = 0;
  let rateLimitHit = false;

  // Check D1 for webhook-stored events first
  const placeholders = emailIds.map(() => "?").join(",");
  const { results: storedEvents } = await env.SITE_DB.prepare(
    `SELECT * FROM resend_events WHERE emailId IN (${placeholders})`
  ).bind(...emailIds).all();

  const eventMap = new Map();
  for (const evt of storedEvents) {
    eventMap.set(evt.emailId, evt);
  }

  // Process webhook events
  for (const id of emailIds) {
    const evt = eventMap.get(id);
    if (evt) {
      webhookHits++;
      const lastEvent = evt.last_event;
      if (DELIVERED_EVENTS.has(lastEvent)) stats.delivered++;
      if (lastEvent === "clicked") stats.clicked++;
      if (lastEvent === "bounced") stats.bounced++;
      if (lastEvent === "complained") stats.complained++;
      eventDetails.push({ id, to: evt.email, last_event: lastEvent, source: "webhook" });
    }
  }

  // Fallback to Resend API for IDs without webhook data
  const missingIds = emailIds.filter((id) => !eventMap.has(id));

  if (missingIds.length > 0 && env.RESEND_API_KEY) {
    const BATCH_SIZE = 2;
    const BATCH_DELAY = 1000;

    for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
      if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY));
      if (rateLimitHit) break;

      const batch = missingIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (id) => {
          const res = await fetch(`https://api.resend.com/emails/${id}`, {
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
          });
          if (res.status === 429) {
            rateLimitHit = true;
            return null;
          }
          if (!res.ok) return null;
          return res.json();
        })
      );

      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) {
          apiErrors++;
          continue;
        }
        apiHits++;
        const data = result.value;
        const lastEvent = data.last_event || "queued";
        if (DELIVERED_EVENTS.has(lastEvent)) stats.delivered++;
        if (lastEvent === "clicked") stats.clicked++;
        if (lastEvent === "bounced") stats.bounced++;
        if (lastEvent === "complained") stats.complained++;

        const to = Array.isArray(data.to) ? data.to[0] : data.to;
        eventDetails.push({ id: data.id, to, last_event: lastEvent, source: "api" });

        // Cache the result in D1 for future lookups
        const now = new Date().toISOString();
        await env.SITE_DB.prepare(
          "INSERT OR REPLACE INTO resend_events (emailId, email, last_event, events, updated_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(data.id, to || "", lastEvent, "[]", now).run();
      }
    }
  }

  // Use cached stats as floor to prevent flickering
  const cached = JSON.parse(campaign.cachedStats || "{}");
  if (cached.delivered) stats.delivered = Math.max(stats.delivered, cached.delivered);
  if (cached.clicked) stats.clicked = Math.max(stats.clicked, cached.clicked);

  // Cache stats back to campaign
  const now = new Date().toISOString();
  await env.SITE_DB.prepare(
    "UPDATE campaigns SET cachedStats = ?, statsCachedAt = ? WHERE id = ?"
  ).bind(JSON.stringify(stats), now, campaignId).run();

  return Response.json({
    success: true,
    stats,
    eventDetails,
    debug: { totalIds: emailIds.length, webhookHits, apiHits, apiErrors, rateLimitHit },
  });
}
