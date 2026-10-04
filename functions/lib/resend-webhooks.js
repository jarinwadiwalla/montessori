// Delivery tracking: the link between Resend and /api/resend-webhook.
//
// Resend only tells us what happened to an email (delivered, opened,
// clicked, bounced, marked as spam) if a webhook is registered on their
// side, pointed at our endpoint, and signed with a secret we know. For the
// first six months none of that was true and nothing said so: every row in
// resend_events came from pressing "Stats", never from Resend.
//
// So this file does three jobs:
//   - keeps a small health record (when did an event last arrive, when was
//     one last refused), so silence is visible in Guru;
//   - asks Resend what it has registered, and says what is wrong;
//   - repairs it: registers the webhook if it is missing and adopts its
//     signing secret, without anyone copying a secret by hand.
//
// State lives in the `settings` table under its own ids, not in the 'main'
// row, so /api/settings never returns it.

export const WEBHOOK_ENDPOINT = "https://montessoriforadolescents.com/api/resend-webhook";

// Everything that changes what we would show or do for a sent email.
export const WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
];

const CONFIG_ID = "resend-webhook-config";
const HEALTH_ID = "resend-webhook-health";
const REJECT_WRITE_GAP_MS = 60 * 1000;

async function readRow(db, id) {
  try {
    const row = await db.prepare("SELECT data FROM settings WHERE id = ?").bind(id).first();
    return row?.data ? JSON.parse(row.data) : {};
  } catch {
    return {};
  }
}

async function writeRow(db, id, data) {
  await db
    .prepare("INSERT OR REPLACE INTO settings (id, data, updatedAt) VALUES (?, ?, ?)")
    .bind(id, JSON.stringify(data), new Date().toISOString())
    .run();
}

export async function readWebhookConfig(env) {
  return readRow(env.SITE_DB, CONFIG_ID);
}

export async function readWebhookHealth(env) {
  return readRow(env.SITE_DB, HEALTH_ID);
}

// Every secret a genuine webhook could be signed with: the one adopted from
// Resend by "Reconnect", and the one set by hand as a Pages secret.
export async function signingSecrets(env) {
  const config = await readWebhookConfig(env);
  return [config.signingSecret, env.RESEND_WEBHOOK_SECRET].filter(Boolean);
}

// Health is best-effort. It must never be the reason an event is lost.
export async function recordWebhookReceived(env, eventName) {
  try {
    const health = await readWebhookHealth(env);
    health.lastReceivedAt = new Date().toISOString();
    health.lastEventType = eventName;
    health.receivedCount = (health.receivedCount || 0) + 1;
    await writeRow(env.SITE_DB, HEALTH_ID, health);
  } catch (err) {
    console.error("webhook health (received) failed", err);
  }
}

// A refused request costs at most one write a minute, so an unauthenticated
// caller cannot turn this into a way of hammering the database.
export async function recordWebhookRejected(env, reason) {
  try {
    const health = await readWebhookHealth(env);
    const last = Date.parse(health.lastRejectedAt || "") || 0;
    if (Date.now() - last < REJECT_WRITE_GAP_MS) return;
    health.lastRejectedAt = new Date().toISOString();
    health.lastRejectedReason = reason;
    health.rejectedCount = (health.rejectedCount || 0) + 1;
    await writeRow(env.SITE_DB, HEALTH_ID, health);
  } catch (err) {
    console.error("webhook health (rejected) failed", err);
  }
}

// ---- talking to Resend ---------------------------------------------

function normalise(url) {
  return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
}

async function resendCall(ctx, method, path, body) {
  const res = await ctx.fetchImpl(`${ctx.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const detail = json?.message || json?.error || res.statusText || "request failed";
    const err = new Error(`Resend said ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function context(env, fetchImpl) {
  return {
    apiKey: env.RESEND_API_KEY,
    base: env.RESEND_API_BASE || "https://api.resend.com",
    // Wrapped, not stored bare: on Workers, calling the global fetch as a
    // property of another object ("ctx.fetchImpl(...)") is an illegal
    // invocation.
    fetchImpl: fetchImpl || ((url, init) => fetch(url, init)),
  };
}

// What Resend has registered, without secrets.
export async function listResendWebhooks(env, fetchImpl) {
  const json = await resendCall(context(env, fetchImpl), "GET", "/webhooks");
  const rows = Array.isArray(json) ? json : json?.data || [];
  return rows.map((w) => ({
    id: w.id,
    endpoint: w.endpoint,
    status: w.status || "",
    events: w.events || [],
    isOurs: normalise(w.endpoint) === normalise(WEBHOOK_ENDPOINT),
  }));
}

// Make sure a webhook for our endpoint exists and that we hold its signing
// secret. Returns a summary that is safe to show; the secret stays here.
export async function reconnectResendWebhook(env, fetchImpl) {
  if (!env.RESEND_API_KEY) {
    throw new Error("No Resend API key is set on this deployment.");
  }
  const ctx = context(env, fetchImpl);
  const existing = await listResendWebhooks(env, fetchImpl);
  const ours = existing.find((w) => w.isOurs);

  let id;
  let secret;
  let action;
  let events;
  let status;

  if (ours) {
    const detail = await resendCall(ctx, "GET", `/webhooks/${ours.id}`);
    id = ours.id;
    secret = detail?.signing_secret;
    events = detail?.events || ours.events;
    status = detail?.status || ours.status;
    action = "adopted";
  } else {
    const created = await resendCall(ctx, "POST", "/webhooks", {
      endpoint: WEBHOOK_ENDPOINT,
      events: WEBHOOK_EVENTS,
    });
    id = created?.id;
    secret = created?.signing_secret;
    events = WEBHOOK_EVENTS;
    status = "enabled";
    action = "created";
  }

  if (!id || !secret) {
    throw new Error("Resend did not return a signing secret for the webhook.");
  }

  await writeRow(env.SITE_DB, CONFIG_ID, {
    webhookId: id,
    signingSecret: secret,
    endpoint: WEBHOOK_ENDPOINT,
    events,
    connectedAt: new Date().toISOString(),
    action,
  });

  // Refusals from before the repair no longer describe the present. Leave
  // the counts, drop the marker, so the verdict is not "rejecting" until
  // the next event happens to arrive.
  const health = await readWebhookHealth(env);
  if (health.lastRejectedAt) {
    delete health.lastRejectedAt;
    delete health.lastRejectedReason;
    await writeRow(env.SITE_DB, HEALTH_ID, health);
  }

  return {
    action,
    webhookId: id,
    status,
    events,
    missingEvents: WEBHOOK_EVENTS.filter((e) => !events.includes(e)),
    others: existing.filter((w) => !w.isOurs).map(({ id: wid, endpoint, status: st }) => ({ id: wid, endpoint, status: st })),
  };
}

// One word for the state of delivery tracking, and one sentence a person
// can act on. `webhooks` is null when Resend could not be asked.
export function describeWebhookState({ health = {}, config = {}, hasEnvSecret = false, webhooks = null }) {
  const received = Date.parse(health.lastReceivedAt || "") || 0;
  const rejected = Date.parse(health.lastRejectedAt || "") || 0;
  const ours = webhooks ? webhooks.find((w) => w.isOurs) : undefined;

  if (webhooks && !ours) {
    return {
      verdict: "not-registered",
      advice:
        "Resend has no webhook pointing at this site, so it never reports opens, clicks or bounces. Reconnect registers one.",
    };
  }
  if (ours && ours.status && ours.status !== "enabled") {
    return {
      verdict: "disabled",
      advice: `The webhook exists in Resend but is ${ours.status}. Enable it in Resend, under Webhooks.`,
    };
  }
  if (rejected > received) {
    return {
      verdict: "rejecting",
      advice:
        "Resend is sending events but they fail the signature check, so they are being refused. Reconnect adopts the right signing secret.",
    };
  }
  if (received) {
    return { verdict: "live", advice: "Events are arriving from Resend." };
  }
  if (!config.signingSecret && !hasEnvSecret) {
    return {
      verdict: "no-secret",
      advice: "No signing secret is known for the webhook. Reconnect fetches it from Resend.",
    };
  }
  if (!webhooks) {
    return {
      verdict: "unknown",
      advice:
        "Resend could not be asked whether a webhook is registered, and no event has arrived from it. Reconnect will try again.",
    };
  }
  return {
    verdict: "waiting",
    advice:
      "The webhook is registered but no event has arrived yet. Send yourself a test email, then check again in a minute.",
  };
}
