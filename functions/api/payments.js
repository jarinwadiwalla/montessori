// Admin-only view of money received, for Guru.
//
// GET  /api/payments — everything Guru's Payments tab needs in one call:
//        payments list, per-donor totals, and Collective dues summary (MRR).
// POST /api/payments — backfill/sync the mirror from Stripe itself
//        (checkout sessions + subscription invoices). Safe to re-run;
//        rows are keyed by payment id and simply overwrite.

import { requireAdminStrict } from "../lib/auth.js";
import { classifyPayment, recordPayment } from "../lib/payments.js";
import { normalizeEmail } from "../lib/community-auth.js";

export async function onRequestGet(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env } = context;

  const { results: payments } = await env.SITE_DB.prepare(
    `SELECT * FROM payments ORDER BY created_at DESC LIMIT 500`
  ).all();

  const { results: donors } = await env.SITE_DB.prepare(
    `SELECT email, MAX(name) AS name, SUM(amount) AS total, COUNT(*) AS count,
            MAX(created_at) AS last_at
     FROM payments WHERE kind = 'donation' AND email != ''
     GROUP BY email ORDER BY total DESC`
  ).all();

  const { results: dues } = await env.SITE_DB.prepare(
    `SELECT plan, COUNT(*) AS n FROM community_members
     WHERE status = 'active' AND subscription_id != ''
       AND subscription_status IN ('active', 'trialing', 'past_due')
     GROUP BY plan`
  ).all();

  let monthly = 0;
  let annual = 0;
  for (const row of dues) {
    if (row.plan === "monthly") monthly = row.n;
    if (row.plan === "annual") annual = row.n;
  }

  const { results: totals } = await env.SITE_DB.prepare(
    `SELECT kind, SUM(amount) AS total, COUNT(*) AS count
     FROM payments GROUP BY kind`
  ).all();

  return Response.json({
    payments,
    donors,
    totals,
    collective: {
      monthly_members: monthly,
      annual_members: annual,
      // cents: $5/mo and $50/yr
      mrr: monthly * 500 + Math.round((annual * 5000) / 12),
    },
  });
}

export async function onRequestPost(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env } = context;
  if (!env.STRIPE_SECRET_KEY) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  let imported = 0;

  // 1. Checkout sessions: donations, webinars, guides, Collective joins.
  imported += await syncPaged(
    env,
    "https://api.stripe.com/v1/checkout/sessions?limit=100&expand[]=data.line_items",
    async (session) => {
      if (session.payment_status !== "paid" || !session.amount_total) return false;
      const items = session.line_items?.data || [];
      const { kind, description } = classifyPayment(items, env);
      await recordPayment(env, {
        id: session.payment_intent || session.id,
        email: normalizeEmail(session.customer_details?.email || session.customer_email || ""),
        name: (session.customer_details?.name || "").slice(0, 60),
        amount: session.amount_total,
        currency: session.currency || "usd",
        description,
        kind,
        source: "checkout",
        stripe_customer_id: typeof session.customer === "string" ? session.customer : "",
        created_at: new Date(session.created * 1000).toISOString(),
      });
      return true;
    }
  );

  // 2. Paid subscription invoices — the renewals checkout never sees.
  imported += await syncPaged(
    env,
    "https://api.stripe.com/v1/invoices?status=paid&limit=100",
    async (invoice) => {
      if (invoice.billing_reason === "subscription_create") return false;
      if (!invoice.amount_paid) return false;
      await recordPayment(env, {
        id: invoice.payment_intent || invoice.id,
        email: normalizeEmail(invoice.customer_email || ""),
        name: (invoice.customer_name || "").slice(0, 60),
        amount: invoice.amount_paid,
        currency: invoice.currency || "usd",
        description: "Collective dues renewal",
        kind: "collective",
        source: "invoice",
        stripe_customer_id: typeof invoice.customer === "string" ? invoice.customer : "",
        created_at: new Date(invoice.created * 1000).toISOString(),
      });
      return true;
    }
  );

  return Response.json({ ok: true, imported });
}

// Walk a paginated Stripe list, applying `handle` to each object.
// Capped at 10 pages (1000 objects) — far beyond this account's volume.
async function syncPaged(env, baseUrl, handle) {
  let count = 0;
  let startingAfter = "";

  for (let page = 0; page < 10; page++) {
    const url = startingAfter
      ? `${baseUrl}&starting_after=${startingAfter}`
      : baseUrl;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) break;
    const body = await res.json();
    const data = body.data || [];
    for (const obj of data) {
      if (await handle(obj)) count++;
    }
    if (!body.has_more || !data.length) break;
    startingAfter = data[data.length - 1].id;
  }

  return count;
}
