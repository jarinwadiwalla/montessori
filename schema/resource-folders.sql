-- ============================================================
-- Montessori Adolescent Collective — shared document folders
-- Apply with:
--   npx wrangler d1 execute montessori-db --remote --file schema/resource-folders.sql
-- Additive only: two new tables plus four seeded folders.
-- ============================================================

-- Folders ----------------------------------------------------
-- Members create these freely. `created_by` is the member who made it and
-- is what the rename/delete permission check reads; the four seeded
-- folders below have no creator and are marked is_system so a member
-- can't rename or remove the shelves everyone is filing into.
CREATE TABLE IF NOT EXISTS community_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT DEFAULT '',
  is_system INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folders_name ON community_folders(name);

-- Documents --------------------------------------------------
-- One row per uploaded file. The bytes live in R2; r2_key is kept so a
-- delete can clean up storage rather than orphaning the object.
--
-- kind drives the UI: 'pdf' and 'image' preview in a new window, the
-- office kinds can only be downloaded, and are labelled as such so nobody
-- clicks Preview and gets a download they didn't expect.
CREATE TABLE IF NOT EXISTS community_documents (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  title TEXT NOT NULL,
  filename TEXT DEFAULT '',
  kind TEXT NOT NULL,                 -- pdf | image | doc | slides | sheet
  url TEXT NOT NULL,
  r2_key TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_folder
  ON community_documents(folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_member
  ON community_documents(member_id);

-- The shelves to start with -----------------------------------
-- Fixed ids so re-running this file updates rather than duplicating.
INSERT INTO community_folders (id, name, created_by, is_system, created_at, updated_at)
VALUES
  ('fold_montessori_readings', 'Montessori Readings', '', 1, datetime('now'), datetime('now')),
  ('fold_literature_reviews', 'Individual Literature Reviews', '', 1, datetime('now'), datetime('now')),
  ('fold_brain_development', 'Adolescent Brain Development', '', 1, datetime('now'), datetime('now')),
  ('fold_sexual_education', 'Sexual Education Lessons', '', 1, datetime('now'), datetime('now')),
  ('fold_math_seminars', 'Math Seminars', '', 1, datetime('now'), datetime('now')),
  ('fold_literature_seminars', 'Literature Seminars', '', 1, datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_system = 1;

-- Ordering ---------------------------------------------------
-- Added 2026-08-27. Folders are arranged by hand so related subjects can
-- sit together, rather than being stuck in alphabetical order. Lower
-- sort_order comes first; ties fall back to name.
ALTER TABLE community_folders ADD COLUMN sort_order INTEGER DEFAULT 0;
