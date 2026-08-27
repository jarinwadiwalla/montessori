-- ============================================================
-- Montessori Adolescent Collective — direct messages
-- Apply with:
--   npx wrangler d1 execute montessori-db --remote --file schema/messages.sql
-- Additive only: creates three new tables and touches nothing existing.
-- ============================================================

-- Conversations ----------------------------------------------
-- Exactly one row per pair of members. The pair is stored in a fixed
-- order (member_a always the smaller id) so that a conversation can be
-- found from either side with one lookup, and the unique index makes a
-- duplicate thread impossible even if two people write at once.
--
-- The last message is denormalised onto the row so the conversation list
-- renders from a single query rather than one per thread.
CREATE TABLE IF NOT EXISTS community_conversations (
  id TEXT PRIMARY KEY,
  member_a TEXT NOT NULL,
  member_b TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  last_sender_id TEXT DEFAULT '',
  last_excerpt TEXT DEFAULT '',
  -- Read position per side. A conversation is unread for me when the last
  -- message is newer than my marker and I was not the one who sent it.
  a_last_read_at TEXT DEFAULT '',
  b_last_read_at TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_pair
  ON community_conversations(member_a, member_b);
CREATE INDEX IF NOT EXISTS idx_conversations_a
  ON community_conversations(member_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_b
  ON community_conversations(member_b, last_message_at DESC);

-- Messages ---------------------------------------------------
CREATE TABLE IF NOT EXISTS community_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON community_messages(conversation_id, created_at);

-- Mutes ------------------------------------------------------
-- One-directional: if I mute someone, they can no longer start or
-- continue a conversation with me. They are not told, which avoids
-- turning a quiet exit into a confrontation.
CREATE TABLE IF NOT EXISTS community_mutes (
  member_id TEXT NOT NULL,
  muted_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, muted_id)
);
