const EVENT_PRIORITY = { complained: 6, clicked: 5, opened: 4, delivered: 3, bounced: 2, sent: 1, queued: 0 };

async function verifySignature(request, secret) {
  if (!secret) return true;

  const msgId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!msgId || !timestamp || !signature) return false;

  // Check timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp);
  if (Math.abs(now - ts) > 300) return false;

  // Decode the secret (whsec_ prefix + base64)
  const secretKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(secretKey), (c) => c.charCodeAt(0));

  const toSign = `${msgId}.${timestamp}.`;
  const body = await request.clone().text();
  const payload = toSign + body;

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Check against all signatures (comma-separated)
  const sigs = signature.split(" ");
  for (const s of sigs) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1] === expected) return true;
  }
  return false;
}

export async function onRequestPost(context) {
  const { env, request } = context;

  // Verify webhook signature if secret is configured
  if (env.RESEND_WEBHOOK_SECRET) {
    const valid = await verifySignature(request, env.RESEND_WEBHOOK_SECRET);
    if (!valid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.type;
  const data = payload.data;

  if (!data || !data.email_id) {
    return Response.json({ ok: true, message: "No email_id, skipping" });
  }

  const emailId = data.email_id;
  const toAddresses = Array.isArray(data.to) ? data.to : [data.to];
  const email = toAddresses[0] || "";
  const eventName = eventType ? eventType.replace("email.", "") : "unknown";
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
    ).bind(emailId, email.toLowerCase().trim(), eventName, JSON.stringify(events), now).run();
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
