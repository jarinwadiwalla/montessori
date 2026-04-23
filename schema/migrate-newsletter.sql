-- Migration: Add newsletter analytics, retry queue, and subscriber tiers
-- Run with: wrangler d1 execute montessori-db --file=schema/migrate-newsletter.sql --remote

-- Add tier column to subscribers
ALTER TABLE subscribers ADD COLUMN tier TEXT DEFAULT 'subscriber';

-- Add columns to campaigns for analytics and retry tracking
ALTER TABLE campaigns ADD COLUMN emailIds TEXT DEFAULT '[]';
ALTER TABLE campaigns ADD COLUMN recipients TEXT DEFAULT '[]';
ALTER TABLE campaigns ADD COLUMN tier TEXT DEFAULT 'all';
ALTER TABLE campaigns ADD COLUMN cachedStats TEXT DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN statsCachedAt TEXT DEFAULT '';
ALTER TABLE campaigns ADD COLUMN retryKey TEXT DEFAULT '';
ALTER TABLE campaigns ADD COLUMN failedCount INTEGER DEFAULT 0;

-- Resend webhook event tracking (for delivery/open/click analytics)
CREATE TABLE IF NOT EXISTS resend_events (
  emailId TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  last_event TEXT DEFAULT 'queued',
  events TEXT DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resend_events_email ON resend_events(email);

-- Retry queue for failed newsletter sends
CREATE TABLE IF NOT EXISTS retry_queue (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  htmlBody TEXT NOT NULL,
  textBody TEXT DEFAULT '',
  failedRecipients TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  campaignId TEXT DEFAULT '',
  retryCount INTEGER DEFAULT 0,
  originalSentAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_retry_queue_status ON retry_queue(status);

-- Normalize legacy 'blog' preferences to 'all'
UPDATE subscribers SET preferences = 'all' WHERE preferences = 'blog';
