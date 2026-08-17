-- ============================================================
-- Montessori Adolescent Collective — community portal
-- Apply with:
--   npx wrangler d1 execute montessori-db --remote --file schema/community.sql
-- ============================================================

-- Members ----------------------------------------------------
-- One row per person who has paid to join. Email is the identity;
-- there are no passwords anywhere in this system by design.
CREATE TABLE IF NOT EXISTS community_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',      -- member | admin
  status TEXT NOT NULL DEFAULT 'active',    -- active | suspended
  joined_at TEXT NOT NULL,
  last_seen_at TEXT DEFAULT '',
  stripe_session_id TEXT DEFAULT '',        -- guards against double-granting
  amount_paid INTEGER DEFAULT 0             -- cents, for your records
);
CREATE INDEX IF NOT EXISTS idx_members_email ON community_members(email);
CREATE INDEX IF NOT EXISTS idx_members_status ON community_members(status);

-- Magic-link sign-in tokens ----------------------------------
-- Short-lived and single-use. Only the SHA-256 hash is stored, so a
-- leaked database still does not let anyone sign in as a member.
CREATE TABLE IF NOT EXISTS community_login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT DEFAULT '',
  ip_address TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_login_tokens_email ON community_login_tokens(email);
CREATE INDEX IF NOT EXISTS idx_login_tokens_expires ON community_login_tokens(expires_at);

-- Sessions ---------------------------------------------------
-- Also stored as a hash; the raw value lives only in the member's cookie.
CREATE TABLE IF NOT EXISTS community_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_member ON community_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON community_sessions(expires_at);

-- Posts ------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible',   -- visible | removed
  removed_reason TEXT DEFAULT '',
  comment_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status ON community_posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_member ON community_posts(member_id);

-- Attachments ------------------------------------------------
-- kind: image | pdf | video  (video stores an embed URL, never an upload)
CREATE TABLE IF NOT EXISTS community_attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  filename TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  r2_key TEXT DEFAULT '',                   -- so deletes can clean up storage
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_post ON community_attachments(post_id);

-- Comments ---------------------------------------------------
CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible',   -- visible | removed
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON community_comments(post_id, created_at);

-- Reports ----------------------------------------------------
-- Members flagging content for your review.
CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,                -- post | comment
  target_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',      -- open | resolved
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status, created_at DESC);
