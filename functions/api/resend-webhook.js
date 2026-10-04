// POST /api/resend-webhook — Resend tells us what happened to an email.
//
// Each event is appended to the email's row in resend_events, and a hard
// bounce or a spam complaint unsubscribes the address. Requests are signed
// (Svix); see functions/lib/svix.js. The signing secret can come from two
// places — adopted from Resend by Guru's "Reconnect", or set by hand as the
// RESEND_WEBHOOK_SECRET Pages secret — and a request signed with either is
// accepted. See functions/lib/resend-webhooks.js for why both exist.

import { verifySvixSignature } from "../lib/svix.js";
import {
  signingSecrets,
  recordWebhookReceived,
  recordWebhookRejected,
} from "../lib/resend-webhooks.js";
import { EVENT_PRIORITY } from "../lib/delivery-stats.js";

export async function onRequestPost(context) {
  const { env, request } = context;

  const body = await request.text();
  const secrets = await signingSecrets(env);

  // With no secret configured anywhere there is nothing to check against;
  // that is the documented "optional" setup and it stays permissive. Once a
  // secret exists, an unsigned or wrongly signed request is refused.
  if (secrets.length > 0) {
    const id = request.headers.get("svix-id");
    const timestamp = request.headers.get("svix-timestamp");
    const signatureHeader = request.headers.get("svix-signature");

    let valid = false;
    for (const secret of secrets) {
      if (await verifySvixSignature({ id, timestamp, signatureHeader, body, secret })) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      // Only a request that carries Svix headers looks like Resend. Noting
      // those is how Guru can tell "Resend is calling with the wrong
      // secret" from "Resend is not calling"; anything else is noise.
      if (id && timestamp && signatureHeader) {
        await recordWebhookRejected(env, "signature");
      }
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.type;
  const data = payload.data;
  const eventName = eventType ? eventType.replace("email.", "") : "unknown";

  // A genuine, signed call arrived: tracking is alive even if this
  // particular event carries nothing we store.
  await recordWebhookReceived(env, eventName);

  if (!data || !data.email_id) {
    return Response.json({ ok: true, message: "No email_id, skipping" });
  }

  const emailId = data.email_id;
  const toAddresses = Array.isArray(data.to) ? data.to : [data.to];
  const email = toAddresses[0] || "";
  const now = new Date().toISOString();
  const eventTimestamp = data.created_at || payload.created_at || now;

  // Store/update event in resend_events table
  const existing = await env.SITE_DB.prepare(
    "SELECT * FROM resend_events WHERE emailId = ?"
  ).bind(emailId).first();

  if (existing) {
    const events = JSON.parse(existing.events || "[]");
    events.push({ type: eventName, timestamp: eventTimestamp });

    // Update last_event only if new event has higher priority
    const currentPriority = EVENT_PRIORITY[existing.last_event] || 0;
    const newPriority = EVENT_PRIORITY[eventName] || 0;
    const lastEvent = newPriority >= currentPriority ? eventName : existing.last_event;

    await env.SITE_DB.prepare(
      "UPDATE resend_events SET last_event = ?, events = ?, updated_at = ? WHERE emailId = ?"
    ).bind(lastEvent, JSON.stringify(events), now, emailId).run();
  } else {
    const events = [{ type: eventName, timestamp: eventTimestamp }];
    await env.SITE_DB.prepare(
      "INSERT INTO resend_events (emailId, email, last_event, events, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(emailId, String(email).toLowerCase().trim(), eventName, JSON.stringify(events), now).run();
  }

  // Handle bounces and complaints by unsubscribing
  if (eventName === "bounced" || eventName === "complained") {
    for (const addr of toAddresses) {
      if (!addr) continue;
      await env.SITE_DB.prepare(
        "UPDATE subscribers SET unsubscribed = 1, unsubscribedAt = ? WHERE email = ? AND unsubscribed = 0"
      ).bind(now, addr.toLowerCase().trim()).run();
    }
  }

  return Response.json({ received: true, emailId, event: eventName });
}
