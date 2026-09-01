-- ============================================================
-- Montessori Adolescent Collective — photo albums
-- Apply with:
--   npx wrangler d1 execute montessori-db --remote --file schema/photo-albums.sql
-- Additive: one new table, one new column, four seeded albums.
-- ============================================================

-- Albums group the gallery the way folders group the document library.
-- Kept as its own table rather than reusing community_folders: the two
-- are browsed differently (a folder shows a file list, an album shows a
-- wall of pictures) and sharing a table would mean every query on either
-- had to filter by type.
CREATE TABLE IF NOT EXISTS community_albums (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT DEFAULT '',
  is_system INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_albums_order ON community_albums(sort_order, name);

-- Which album a photo belongs to. Photos uploaded before albums existed
-- keep an empty value and are shown in the first album.
ALTER TABLE community_photos ADD COLUMN album_id TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_photos_album ON community_photos(album_id, created_at DESC);

-- The albums to start with. Fixed ids so re-running updates rather than
-- duplicating; sort_order spaced by 10 to leave room to reorder.
INSERT INTO community_albums (id, name, created_by, is_system, sort_order, created_at, updated_at)
VALUES
  ('alb_environments', 'Environments', '', 1, 10, datetime('now'), datetime('now')),
  ('alb_farm',         'Farm',         '', 1, 20, datetime('now'), datetime('now')),
  ('alb_kitchen',      'Kitchen',      '', 1, 30, datetime('now'), datetime('now')),
  ('alb_living_room',  'Living Room',  '', 1, 40, datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_system = 1;
