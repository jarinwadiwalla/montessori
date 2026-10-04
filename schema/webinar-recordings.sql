-- Paid webinar recordings: what is on sale, who has bought it, and how a
-- buyer's browser proves it. Read by functions/lib/webinar-access.js.
--
-- Safe to run more than once; it only adds what is missing.

-- One row per recording on sale. The player address lives here and nowhere
-- else: this repo is public and so is the built site, so the address must
-- never be written into either. Add or change a row by hand, for example
--
--   npx wrangler d1 execute montessori-db --remote --command
--     "INSERT OR REPLACE INTO webinar_recordings
--        (webinar_id, title, embed_url, stripe_product_ids, updated_at)
--      VALUES ('<page slug>', '<title>', 'https://www.youtube.com/embed/<id>',
--              'prod_...', datetime('now'))"
CREATE TABLE IF NOT EXISTS webinar_recordings (
  webinar_id TEXT PRIMARY KEY,          -- the page slug: /webinars/<webinar_id>/
  title TEXT DEFAULT '',                -- used in the email that carries the link
  embed_url TEXT DEFAULT '',            -- the player; blank shows "being prepared"
  -- Stripe product ids whose purchase opens this recording, comma-separated.
  -- Add the live ticket's product here too if attending should include it.
  stripe_product_ids TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);

-- Who may watch what. A row here is the whole of someone's entitlement:
-- delete it (after a refund, say) and their links and browsers stop working.
CREATE TABLE IF NOT EXISTS webinar_access (
  webinar_id TEXT NOT NULL,
  email TEXT NOT NULL,                  -- lower-cased, as typed at checkout
  source TEXT DEFAULT '',               -- checkout | sync | backfill | manual
  payment_id TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  link_sent_at TEXT DEFAULT '',         -- when the purchase email went out
  PRIMARY KEY (webinar_id, email)
);

-- Emailed links and the browser sessions they turn into. Only the SHA-256
-- of each token is kept, as with the Collective's sign-in tokens.
CREATE TABLE IF NOT EXISTS webinar_access_tokens (
  token_hash TEXT PRIMARY KEY,
  webinar_id TEXT NOT NULL,
  email TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- link (emailed) | session (cookie)
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_address TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_webinar_tokens_email
  ON webinar_access_tokens(webinar_id, email, created_at);

-- Everyone who paid before the watch page was gated keeps their access.
-- Until then only one webinar had ever been sold, so every 'webinar'
-- payment in the mirror belongs to it, live tickets included. The date
-- stops a later run of this file from handing this recording to buyers of
-- the next webinar; sales after it are matched by product id instead, by
-- the Stripe webhook and by Guru → Payments → Sync from Stripe.
-- Needs schema/payments.sql.
INSERT OR IGNORE INTO webinar_access
  (webinar_id, email, source, payment_id, created_at)
SELECT 'adolescent-environment-overview', email, 'backfill', id, created_at
FROM payments
WHERE kind = 'webinar' AND email != '' AND created_at < '2026-10-05';
