-- ============================================================
-- Montessori Adolescent Collective — hearts on posts
-- Apply with:
--   npx wrangler d1 execute montessori-db --remote --file schema/reactions.sql
-- Additive: one new table.
-- ============================================================

-- One heart per member per post: the composite primary key makes a double
-- heart impossible at the database level, so a double-tap or a retried
-- request can't inflate a count.
CREATE TABLE IF NOT EXISTS community_reactions (
  post_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON community_reactions(post_id);
