import { requireAdmin } from "../lib/auth.js";
import { shouldRefresh, strongerEvent, tally } from "../lib/delivery-stats.js";

// GET /api/campaign-stats?id=<campaign id>
//
// Per-recipient delivery status for one campaign. Rows the webhook keeps
// current are read straight from D1; anything missing, or stored as a stale
// snapshot, is asked for from Resend (see functions/lib/delivery-stats.js).

const API_BATCH_SIZE = 2;      // Resend allows two requests a second
const API_BATCH_DELAY_MS = 1000;

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

  // What is already stored.
  const placeholders = emailIds.map(() => "?").join(",");
  const { results: storedEvents } = await env.SITE_DB.prepare(
    `SELECT * FROM resend_events WHERE emailId IN (${placeholders})`
  ).bind(...emailIds).all();

  const stored = new Map();
  for (const evt of storedEvents) stored.set(evt.emailId, evt);

  // Per email: the status we will report, the address, and where it came from.
  const resolved = new Map();
  const toAsk = [];
  let webhookHits = 0;
  let cachedHits = 0;

  for (const id of emailIds) {
    const row = stored.get(id);
    if (!row) {
      toAsk.push(id);
    } else if (shouldRefresh(row, campaign.sentAt)) {
      // Keep the stored value in hand: it stands if Resend can't be asked.
      resolved.set(id, { to: row.email, last_event: row.last_event, source: "cached" });
      toAsk.push(id);
    } else {
      const fromWebhook = row.events && row.events !== "[]";
      if (fromWebhook) webhookHits++;
      else cachedHits++;
      resolved.set(id, { to: row.email, last_event: row.last_event, source: fromWebhook ? "webhook" : "cached" });
    }
  }

  let apiHits = 0;
  let apiErrors = 0;
  let rateLimitHit = false;

  if (toAsk.length > 0 && env.RESEND_API_KEY) {
    for (let i = 0; i < toAsk.length; i += API_BATCH_SIZE) {
      if (i > 0) await new Promise((r) => setTimeout(r, API_BATCH_DELAY_MS));
      if (rateLimitHit) break;

      const batch = toAsk.slice(i, i + API_BATCH_SIZE);
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
        const previous = stored.get(data.id);
        const lastEvent = strongerEvent(previous?.last_event, data.last_event || "queued");
        const to = (Array.isArray(data.to) ? data.to[0] : data.to) || previous?.email || "";

        resolved.set(data.id, { to, last_event: lastEvent, source: "api" });

        // Store it as a snapshot. The WHERE keeps this from overwriting a
        // row the webhook filled in while we were asking.
        const now = new Date().toISOString();
        await env.SITE_DB.prepare(
          `INSERT INTO resend_events (emailId, email, last_event, events, updated_at)
           VALUES (?, ?, ?, '[]', ?)
           ON CONFLICT(emailId) DO UPDATE SET
             last_event = excluded.last_event,
             updated_at = excluded.updated_at
           WHERE resend_events.events = '[]'`
        ).bind(data.id, to, lastEvent, now).run();
      }
    }
  }

  const eventDetails = [];
  for (const id of emailIds) {
    const r = resolved.get(id);
    if (r) eventDetails.push({ id, to: r.to, last_event: r.last_event, source: r.source });
  }

  const stats = tally(eventDetails.map((d) => d.last_event), emailIds.length);

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
    debug: { totalIds: emailIds.length, webhookHits, cachedHits, apiHits, apiErrors, rateLimitHit },
  });
}
