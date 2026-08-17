// POST /api/community/stripe-webhook
// Stripe calls this when someone pays to join the Collective. It verifies
// the signature, creates the member, and emails them a sign-in link.
//
// Requires the STRIPE_WEBHOOK_SECRET secret (see SETUP notes in
// COMMUNITY-PORTAL-SETUP.md).

import { generateId, normalizeEmail, createLoginToken } from "../../lib/community-auth.js";

const SITE = "https://montessoriforadolescents.com";
const TOLERANCE_SECONDS = 300;

export async function onRequestPost(context) {
  const { env, request } = context;

  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: without a secret we cannot trust anything Stripe sends.
    return new Response("Webhook not configured", { status: 503 });
  }

  const signature = request.headers.get("Stripe-Signature") || "";
  const rawBody = await request.text();

  const verified = await verifyStripeSignature(rawBody, signature, secret);
  if (!verified) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge everything else so Stripe stops retrying.
    return Response.json({ received: true });
  }

  const session = event.data?.object || {};

  // Only grant access when the money actually cleared.
  if (session.payment_status !== "paid") {
    return Response.json({ received: true, skipped: "not paid" });
  }

  const email = normalizeEmail(
    session.customer_details?.email || session.customer_email || ""
  );
  if (!email) {
    return Response.json({ received: true, skipped: "no email" });
  }

  // Idempotency: Stripe retries webhooks, so the same session must not
  // create two members or two welcome emails.
  const already = await env.SITE_DB.prepare(
    "SELECT id FROM community_members WHERE stripe_session_id = ?"
  )
    .bind(session.id || "")
    .first();
  if (already) {
    return Response.json({ received: true, deduped: true });
  }

  const existing = await env.SITE_DB.prepare(
    "SELECT * FROM community_members WHERE email = ?"
  )
    .bind(email)
    .first();

  const now = new Date().toISOString();
  const name = (session.customer_details?.name || "").slice(0, 60);

  if (existing) {
    // Someone who already has a membership paid again — reactivate rather
    // than duplicate, and record the new session id.
    await env.SITE_DB.prepare(
      `UPDATE community_members
       SET status = 'active', stripe_session_id = ?, amount_paid = ?
       WHERE id = ?`
    )
      .bind(session.id || "", session.amount_total || 0, existing.id)
      .run();
  } else {
    await env.SITE_DB.prepare(
      `INSERT INTO community_members
         (id, email, name, avatar_url, bio, role, status, joined_at, stripe_session_id, amount_paid)
       VALUES (?, ?, ?, '', '', 'member', 'active', ?, ?, ?)`
    )
      .bind(
        generateId("mem_"),
        email,
        name,
        now,
        session.id || "",
        session.amount_total || 0
      )
      .run();
  }

  // Welcome them straight in with a working sign-in link.
  if (env.RESEND_API_KEY) {
    const { token, expiresMinutes } = await createLoginToken(env, email, "stripe");
    const link = `${SITE}/collective/verify/?token=${encodeURIComponent(token)}`;

    context.waitUntil(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Montessori Adolescent Collective <newsletter@montessoriforadolescents.com>",
          to: [email],
          subject: "Welcome to the Montessori Adolescent Collective",
          html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#3f265b;">
              <p>Welcome${name ? ` ${escapeHtml(name)}` : ""} — you're in.</p>
              <p>The Montessori Adolescent Collective is a small, private space for people
              doing this work. Use the link below to sign in and set up your profile.</p>
              <p style="margin:28px 0;">
                <a href="${link}" style="background:#3f265b;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">Sign in to the Collective</a>
              </p>
              <p style="color:#6b5b7d;font-size:14px;">This link works once and expires in ${expiresMinutes} minutes.
              You can always request a fresh one at ${SITE}/collective/login/ — there's no password to remember.</p>
              <p style="color:#6b5b7d;font-size:14px;">Please take a moment to read our
              <a href="${SITE}/collective/guidelines/">community guidelines</a> before posting.</p>
            </div>`,
        }),
      }).catch(() => {})
    );
  }

  if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
    context.waitUntil(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
          to: [env.ADMIN_EMAIL],
          subject: "New Collective member",
          html: `<p><strong>${escapeHtml(name || email)}</strong> just joined the Collective.</p>`,
        }),
      }).catch(() => {})
    );
  }

  return Response.json({ received: true });
}

// Stripe's scheme: sign "<timestamp>.<raw body>" with HMAC-SHA256.
async function verifyStripeSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((p) => p.split("="))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()])
  );

  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;

  // Reject old signatures so a captured request can't be replayed later.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  );

  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, provided);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
