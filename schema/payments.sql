-- Mirror of every payment Stripe tells us about, so Guru can show donors,
-- dues and totals without calling Stripe on every page view.
-- Fed live by the Stripe webhook; backfilled by POST /api/payments (sync).

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,              -- payment_intent id (or session/invoice id)
  email TEXT DEFAULT '',
  name TEXT DEFAULT '',
  amount INTEGER DEFAULT 0,         -- cents, what was actually paid
  currency TEXT DEFAULT 'usd',
  description TEXT DEFAULT '',      -- product name(s)
  kind TEXT DEFAULT 'other',        -- collective | donation | webinar | other
  source TEXT DEFAULT '',           -- checkout | invoice
  stripe_customer_id TEXT DEFAULT '',
  created_at TEXT NOT NULL          -- ISO, when Stripe took the payment
);

CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);
CREATE INDEX IF NOT EXISTS idx_payments_kind ON payments(kind);
