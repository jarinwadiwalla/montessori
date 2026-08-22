// POST /api/community/stripe-webhook
//
// Stripe tells us about membership dues here. Because dues recur, this
// handles the whole lifecycle, not just the first payment:
//
//   checkout.session.completed  — someone joined
//   invoice.paid                — a renewal went through
//   customer.subscription.updated — plan change, cancellation scheduled,
//                                   payment trouble
//   customer.subscription.deleted — subscription ended; access stops
//
// Requires STRIPE_WEBHOOK_SECRET. Without it every request is refused —
// otherwise anyone could POST "they paid" and let themselves in free.

import { generateId, normalizeEmail, createLoginToken } from "../../lib/community-auth.js";
import { ensureSubscriber } from "../../lib/community-list.js";
import { ensureHandle } from "../../lib/community-mentions.js";

const SITE = "https://montessoriforadolescents.com";
const TOLERANCE_SECONDS = 300;

export async function onRequestPost(context) {
  const { env, request } = context;

  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  const signature = request.headers.get("Stripe-Signature") || "";
  const rawBody = await request.text();

  if (!(await verifyStripeSignature(rawBody, signature, secret))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckout(context, event);
    case "invoice.paid":
      return handleInvoicePaid(context, event);
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return handleSubscriptionChange(context, event);
    default:
      // Acknowledge everything else so Stripe stops retrying.
      return Response.json({ received: true });
  }
}

// --- someone joined -------------------------------------------

async function handleCheckout(context, event) {
  const { env } = context;
  const session = event.data?.object || {};

  // Subscriptions can complete before the first invoice settles; "paid"
  // or "no_payment_required" both mean we're good.
  if (!["paid", "no_payment_required"].includes(session.payment_status)) {
    return Response.json({ received: true, skipped: "not paid" });
  }

  // This webhook receives every checkout on the whole Stripe account —
  // webinar recordings, guides, donations, all of it. Only a purchase of
  // the Collective product itself may grant membership.
  const productId = env.STRIPE_COLLECTIVE_PRODUCT_ID;
  if (!productId) {
    await notifyAdmin(
      context,
      `A checkout completed but <code>STRIPE_COLLECTIVE_PRODUCT_ID</code> is not
       set, so no membership was granted. Set it with
       <code>npx wrangler pages secret put STRIPE_COLLECTIVE_PRODUCT_ID --project-name montessori</code>
       using the product id from Stripe → Product catalog → Montessori
       Adolescent Collective.`,
      "Collective webhook is not configured — a checkout was ignored"
    );
    return Response.json({ received: true, skipped: "no product id configured" });
  }

  const items = await fetchLineItems(env, session.id);
  if (items === null) {
    // Couldn't ask Stripe what was bought. Refuse for now; Stripe will
    // retry the event and we can decide correctly then.
    return new Response("Could not fetch line items", { status: 500 });
  }
  const isCollective = items.some((i) => i.price?.product === productId);
  if (!isCollective) {
    return Response.json({ received: true, skipped: "not a Collective purchase" });
  }

  const email = normalizeEmail(
    session.customer_details?.email || session.customer_email || ""
  );
  if (!email) return Response.json({ received: true, skipped: "no email" });

  // Stripe retries webhooks; the same session must not be processed twice.
  const already = await env.SITE_DB.prepare(
    "SELECT id FROM community_members WHERE stripe_session_id = ?"
  )
    .bind(session.id || "")
    .first();
  if (already) return Response.json({ received: true, deduped: true });

  const customerId = session.customer || "";
  const name = (session.customer_details?.name || "").slice(0, 60);
  const now = new Date().toISOString();

  // Ask Stripe what they actually bought, so plan and renewal date are
  // right rather than guessed from the amount.
  const sub = session.subscription
    ? await fetchSubscription(env, session.subscription)
    : null;

  let subscriptionId = session.subscription || "";
  let plan = planFromSubscription(sub);
  let periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : "";
  let oneTime = false;

  if (!subscriptionId) {
    // Money arrived with no subscription attached — the Stripe price is
    // almost certainly configured as one-off rather than recurring.
    //
    // A blank subscription_id would mark this person comped, and comped
    // members never lapse, so they'd get free access forever. Give a year
    // instead and tell Jarin, so a misconfigured price costs one year
    // rather than a lifetime membership.
    oneTime = true;
    subscriptionId = `onetime_${session.id}`;
    plan = "one_time";
    periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  }

  const existing = await env.SITE_DB.prepare(
    "SELECT * FROM community_members WHERE email = ?"
  )
    .bind(email)
    .first();

  if (existing) {
    // Rejoining, or switching plan. Reactivate rather than duplicate.
    await env.SITE_DB.prepare(
      `UPDATE community_members
       SET status = 'active', stripe_session_id = ?, amount_paid = ?,
           stripe_customer_id = ?, subscription_id = ?, subscription_status = ?,
           plan = ?, current_period_end = ?, cancel_at_period_end = 0
       WHERE id = ?`
    )
      .bind(
        session.id || "",
        session.amount_total || 0,
        customerId,
        subscriptionId,
        sub?.status || "active",
        plan,
        periodEnd,
        existing.id
      )
      .run();
  } else {
    await env.SITE_DB.prepare(
      `INSERT INTO community_members
         (id, email, name, avatar_url, bio, location, open_to_exchange,
          role, status, joined_at, stripe_session_id, amount_paid,
          stripe_customer_id, subscription_id, subscription_status, plan,
          current_period_end, cancel_at_period_end)
       VALUES (?, ?, ?, '', '', '', 0, 'member', 'active', ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
      .bind(
        generateId("mem_"),
        email,
        name,
        now,
        session.id || "",
        session.amount_total || 0,
        customerId,
        subscriptionId,
        sub?.status || "active",
        plan,
        periodEnd
      )
      .run();
  }

  // Put them on the mailing list so event announcements can reach them,
  // and so the unsubscribe link has something to act on.
  await ensureSubscriber(env, email, name);

  if (name) {
    const row = await env.SITE_DB.prepare(
      "SELECT id FROM community_members WHERE email = ?"
    ).bind(email).first();
    if (row) await ensureHandle(env, row.id, name);
  }

  await sendWelcome(context, email, name, plan);

  if (oneTime) {
    await notifyAdmin(
      context,
      `<strong>${escapeHtml(name || email)}</strong> paid, but Stripe sent no subscription
       with it — that price is probably set to <em>one-off</em> rather than
       <em>recurring</em>. They've been given one year of access rather than
       permanent access, so nothing is broken for them, but the price should be
       fixed so it renews. Check Product catalog → Montessori Adolescent
       Collective in Stripe.`,
      "Check your Stripe pricing — a payment arrived without a subscription"
    );
  } else {
    await notifyAdmin(
      context,
      `<strong>${escapeHtml(name || email)}</strong> just joined the Collective (${plan || "member"}).`
    );
  }

  return Response.json({ received: true });
}

// --- a renewal went through -----------------------------------

async function handleInvoicePaid(context, event) {
  const { env } = context;
  const invoice = event.data?.object || {};
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return Response.json({ received: true });

  const sub = await fetchSubscription(env, subscriptionId);

  // Prefer the period end Stripe reports; fall back to the invoice's own
  // line item, which is present on the webhook payload itself.
  const periodEndUnix =
    sub?.current_period_end || invoice.lines?.data?.[0]?.period?.end || null;
  const periodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : "";

  // Only overwrite the renewal date when we actually learned a new one.
  // Writing "" here would erase it, and a blank date makes membershipLapsed
  // fall back to the status alone — which would keep a failing card in.
  await env.SITE_DB.prepare(
    `UPDATE community_members
     SET subscription_status = ?,
         current_period_end = CASE WHEN ? != '' THEN ? ELSE current_period_end END,
         amount_paid = ?,
         status = CASE WHEN status = 'suspended' THEN 'suspended' ELSE 'active' END
     WHERE subscription_id = ?`
  )
    .bind(
      sub?.status || "active",
      periodEnd,
      periodEnd,
      invoice.amount_paid || 0,
      subscriptionId
    )
    .run();

  return Response.json({ received: true });
}

// --- cancelled, lapsed, or plan changed -----------------------

async function handleSubscriptionChange(context, event) {
  const { env } = context;
  const sub = event.data?.object || {};
  if (!sub.id) return Response.json({ received: true });

  const ended = event.type === "customer.subscription.deleted";
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : "";

  await env.SITE_DB.prepare(
    `UPDATE community_members
     SET subscription_status = ?, current_period_end = ?, plan = ?,
         cancel_at_period_end = ?
     WHERE subscription_id = ?`
  )
    .bind(
      ended ? "canceled" : sub.status || "",
      periodEnd,
      planFromSubscription(sub),
      sub.cancel_at_period_end ? 1 : 0,
      sub.id
    )
    .run();

  // Note: access is decided by membershipLapsed() at request time, not by
  // flipping `status` here. That keeps "suspended by a moderator" and
  // "dues unpaid" as separate things.
  return Response.json({ received: true });
}

// --- helpers --------------------------------------------------

// Read a subscription back from Stripe. Optional: without a secret key we
// fall back to whatever the webhook payload carried.
async function fetchSubscription(env, id) {
  if (!env.STRIPE_SECRET_KEY) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${id}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Read a checkout session's line items back from Stripe, so we can tell a
// Collective purchase apart from anything else sold on the account.
// Returns an array, or null when Stripe couldn't be asked.
async function fetchLineItems(env, sessionId) {
  if (!env.STRIPE_SECRET_KEY || !sessionId) return null;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=100`,
      { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }
    );
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.data) ? body.data : null;
  } catch {
    return null;
  }
}

function planFromSubscription(sub) {
  const interval = sub?.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === "year") return "annual";
  if (interval === "month") return "monthly";
  return "";
}

async function sendWelcome(context, email, name, plan) {
  const { env } = context;
  if (!env.RESEND_API_KEY) return;

  const { token, expiresMinutes } = await createLoginToken(env, email, "stripe");
  const link = `${SITE}/collective/verify/?token=${encodeURIComponent(token)}`;
  const dues =
    plan === "annual"
      ? "Your dues are paid for the year."
      : plan === "monthly"
        ? "Your dues renew monthly, and you can change or cancel them any time from Billing inside the Collective."
        : "";

  context.waitUntil(
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "The Montessori Adolescent Collective <newsletter@montessoriforadolescents.com>",
        to: [email],
        subject: "Welcome to the Montessori Adolescent Collective",
        html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#3f265b;">
            <p>Welcome${name ? ` ${escapeHtml(name)}` : ""} — you're in.</p>
            <p>The Montessori Adolescent Collective is a collaborative online community
            for all things third plane of development. Use the link below to sign in
            and set up your profile.</p>
            <p style="margin:28px 0;">
              <a href="${link}" style="background:#3f265b;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">Sign in to the Collective</a>
            </p>
            <p style="color:#6b5b7d;font-size:14px;">This link works once and expires in ${expiresMinutes} minutes.
            You can always request a fresh one at ${SITE}/collective/login/ — there's no password to remember.</p>
            ${dues ? `<p style="color:#6b5b7d;font-size:14px;">${dues}</p>` : ""}
            <p style="color:#6b5b7d;font-size:14px;">Please take a moment to read our
            <a href="${SITE}/collective/guidelines/">community guidelines</a> before posting.</p>
          </div>`,
      }),
    }).catch(() => {})
  );
}

// `message` is trusted HTML built by the callers above; any member-supplied
// values inside it are escaped at the call site.
async function notifyAdmin(context, message, subject = "New Collective member") {
  const { env } = context;
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) return;
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
        subject,
        html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#3f265b;">${message}</div>`,
      }),
    }).catch(() => {})
  );
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
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
