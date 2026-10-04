// What we know about one sent email is a row in resend_events. A row gets
// there one of two ways:
//
//   - from the webhook, as events arrive. Its `events` list is non-empty
//     and it stays current on its own.
//   - from pressing "Stats", which asks Resend for the email's latest
//     status and stores it. Its `events` list is empty: it is a snapshot of
//     one moment.
//
// A snapshot used to be trusted for ever, so a campaign looked exactly as
// it did the first time anyone opened its stats: someone who clicked an
// hour later stayed "delivered". Snapshots now go stale and are asked for
// again, while the campaign is recent enough for its numbers to move.

export const EVENT_PRIORITY = {
  complained: 6,
  clicked: 5,
  opened: 4,
  delivered: 3,
  bounced: 2,
  failed: 2,
  suppressed: 2,
  delivery_delayed: 1,
  sent: 1,
  queued: 0,
};
export const DELIVERED_EVENTS = new Set(["delivered", "opened", "clicked"]);

const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const MOVING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// Nothing follows these that would change what we show.
const SETTLED = new Set(["bounced", "complained"]);

export function isSnapshot(row) {
  return !row?.events || row.events === "[]";
}

// Should this stored row be checked against Resend again?
export function shouldRefresh(row, campaignSentAt, nowMs = Date.now()) {
  if (!isSnapshot(row)) return false;
  if (SETTLED.has(row.last_event)) return false;
  const sent = Date.parse(campaignSentAt || "");
  if (Number.isFinite(sent) && nowMs - sent > MOVING_WINDOW_MS) return false;
  const updated = Date.parse(row.updated_at || "");
  if (!Number.isFinite(updated)) return true;
  return nowMs - updated > SNAPSHOT_TTL_MS;
}

// Resend reports the most recent event, which is not always the most
// telling one (an open after a click reads "opened"). Keep the stronger.
export function strongerEvent(a, b) {
  const pa = EVENT_PRIORITY[a] ?? -1;
  const pb = EVENT_PRIORITY[b] ?? -1;
  return pb > pa ? b : a;
}

export function tally(lastEvents, total) {
  const stats = { total, delivered: 0, clicked: 0, bounced: 0, complained: 0 };
  for (const e of lastEvents) {
    if (DELIVERED_EVENTS.has(e)) stats.delivered++;
    if (e === "clicked") stats.clicked++;
    if (e === "bounced") stats.bounced++;
    if (e === "complained") stats.complained++;
  }
  return stats;
}
