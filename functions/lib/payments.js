// Shared helpers for the payments mirror table.

// Decide what a payment was for, from its line items. Product ids beat
// name matching; names are the fallback for products we don't know by id.
export function classifyPayment(items, env) {
  const collectiveIds = (env.STRIPE_COLLECTIVE_PRODUCT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const names = items
    .map((i) => i.description || i.price?.nickname || "")
    .filter(Boolean);
  const haystack = names.join(" ").toLowerCase();

  let kind = "other";
  if (items.some((i) => collectiveIds.includes(i.price?.product))) {
    kind = "collective";
  } else if (haystack.includes("donat") || haystack.includes("coffee")) {
    kind = "donation";
  } else if (haystack.includes("webinar")) {
    kind = "webinar";
  }

  return { kind, description: names.join(", ").slice(0, 200) };
}

// Idempotent: Stripe retries webhooks and the sync can overlap them, so
// the same payment id simply overwrites itself.
export async function recordPayment(env, p) {
  await env.SITE_DB.prepare(
    `INSERT OR REPLACE INTO payments
       (id, email, name, amount, currency, description, kind, source,
        stripe_customer_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      p.id,
      p.email || "",
      p.name || "",
      p.amount || 0,
      p.currency || "usd",
      p.description || "",
      p.kind || "other",
      p.source || "",
      p.stripe_customer_id || "",
      p.created_at
    )
    .run();
}
