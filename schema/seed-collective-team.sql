-- ============================================================
-- Seed the Collective directory with the Montessori for Adolescents
-- team, so the room isn't empty on day one.
--
-- This file keeps PLACEHOLDER emails on purpose: the montessori repo is
-- public, so real addresses must never be committed here.
--
-- The version with everyone's real emails lives beside this one as
-- schema/seed-collective-team.local.sql, which is gitignored. Run that
-- one. If it is ever lost, copy this file to *.local.sql and fill the
-- addresses in there.
--
-- Apply with:
--   npx wrangler d1 execute montessori-db --remote --file schema/seed-collective-team.sql
--
-- Safe to run more than once: existing rows are updated, not duplicated.
-- ============================================================

-- Jarin — Director, and the Collective's organiser (admin) ------
INSERT INTO community_members
  (id, email, name, avatar_url, bio, location, open_to_exchange,
   role, status, joined_at, stripe_session_id, amount_paid)
VALUES (
  'mem_jarin',
  'jarin.wadiwalla@gmail.com',
  'Jarin Wadiwalla',
  '/images/jarin-headshot.jpg',
  'AMI 12–18 Diploma',
  'Indonesia',
  1,
  'admin',
  'active',
  datetime('now'),
  'team',
  0
)
ON CONFLICT(email) DO UPDATE SET
  name = excluded.name,
  avatar_url = excluded.avatar_url,
  bio = excluded.bio,
  location = excluded.location,
  role = 'admin',
  status = 'active';

-- Alex Pape ----------------------------------------------------
-- TODO: replace the email below with Alex's real address.
INSERT INTO community_members
  (id, email, name, avatar_url, bio, location, open_to_exchange,
   role, status, joined_at, stripe_session_id, amount_paid)
VALUES (
  'mem_alex',
  'alex@REPLACE-WITH-REAL-EMAIL.com',
  'Alex Pape',
  '/images/alex-headshot.jpg',
  'AMI 12–18 Diploma',
  'France',
  1,
  'admin',
  'active',
  datetime('now'),
  'team',
  0
)
ON CONFLICT(email) DO UPDATE SET
  name = excluded.name,
  avatar_url = excluded.avatar_url,
  bio = excluded.bio,
  location = excluded.location,
  role = 'admin',
  status = 'active';

-- Lola Odessey Waters ------------------------------------------
-- TODO: replace the email below with Lola's real address.
INSERT INTO community_members
  (id, email, name, avatar_url, bio, location, open_to_exchange,
   role, status, joined_at, stripe_session_id, amount_paid)
VALUES (
  'mem_lola',
  'lola@REPLACE-WITH-REAL-EMAIL.com',
  'Lola Odessey Waters',
  '/images/lola-headshot.jpg',
  'AMI 12–18 Diploma',
  'France',
  1,
  'admin',
  'active',
  datetime('now'),
  'team',
  0
)
ON CONFLICT(email) DO UPDATE SET
  name = excluded.name,
  avatar_url = excluded.avatar_url,
  bio = excluded.bio,
  location = excluded.location,
  role = 'admin',
  status = 'active';

-- ------------------------------------------------------------
-- All three are organisers: they can add events and remove any post
-- or comment. To step someone back to an ordinary member later:
--
--   UPDATE community_members SET role = 'member'
--   WHERE email = 'them@example.com';
--
-- To correct an email address later:
--
--   UPDATE community_members SET email = 'real@address.com'
--   WHERE id = 'mem_alex';
-- ------------------------------------------------------------
