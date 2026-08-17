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
  'Director of Montessori for Adolescents and Montessori Guide. Eight years in Montessori education, weaving yoga and Acutonics® sound therapy into whole-person adolescent work.',
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
  'Montessori Guide. Working with Erdkinder communities since 2019, guiding adolescents through purposeful work on the land and in the classroom. Currently establishing a residential Erdkinder community in southern France.',
  'France',
  1,
  'member',
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
  'Montessori Guide and Educational Program Coordinator. Her study of contemplative practices guides adolescents toward success in their studies and social connections. Also a Tibetan–French interpreter in Buddhist philosophy.',
  'France',
  1,
  'member',
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
  status = 'active';

-- ------------------------------------------------------------
-- Afterwards, if you want Alex and Lola to be able to run events
-- and moderate posts as well, promote them:
--
--   UPDATE community_members SET role = 'admin'
--   WHERE email IN ('alex@...', 'lola@...');
--
-- To correct an email address later:
--
--   UPDATE community_members SET email = 'real@address.com'
--   WHERE id = 'mem_alex';
-- ------------------------------------------------------------
