-- ============================================================
-- Montessori Adolescent Collective — photo gallery
-- Apply with:
--   npx wrangler d1 execute montessori-db --remote --file schema/gallery.sql
-- Additive only: one new table.
-- ============================================================

-- Kept separate from community_documents on purpose. The document library
-- is for filing things people need to find again; the gallery is for
-- looking at. Same R2 bucket underneath, different intent, different
-- browsing — mixing them would make both worse.
CREATE TABLE IF NOT EXISTS community_photos (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  caption TEXT DEFAULT '',
  url TEXT NOT NULL,
  r2_key TEXT DEFAULT '',
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_created ON community_photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_member ON community_photos(member_id);
