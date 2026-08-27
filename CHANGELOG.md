# Changelog

## [1.2.0] - 2026-08-24

### Added
- **Direct messages** between members. One-to-one private conversations,
  reachable from the sidebar and from a Message button on every member
  card. Three new tables (`community_conversations`, `community_messages`,
  `community_mutes` — see `schema/messages.sql`, already applied to
  production). Members can mute someone, which silently stops them
  messaging you, or report a conversation, which is the only thing that
  surfaces a thread to the team. No admin endpoint can read messages.
  Email notification on a new conversation, or when the recipient had
  already caught up — a back-and-forth doesn't email every line. The
  template (`member-new-message`) is editable in Guru → System emails.
- Unread message badge in the sidebar; the count rides along on
  `/api/community/me` so it costs no extra request.

### Changed
- Direct messages moved out of the main sidebar into Members ("Your
  conversations" at the top of the directory, plus the Message button on
  each card). The board is the point of the place; a Messages tab in the
  main nav competed with it. The unread badge moved onto the Members link
  rather than disappearing.
- Sign-in now lands a returning member on the **board**, not Start here.
  Start here remains the orientation screen shown once, right after
  first-time profile setup — it was previously opening on every sign-in
  forever.
- Community guidelines rewritten with Jarin's wording: posting photos stay
  inside the Collective, advice only when asked for, share what's
  Montessori-based or cite the source, platform feedback. Student privacy
  and photos are now separate sections.

### Fixed
- "How concerns are handled" in the guidelines told members to use a Report
  button on posts and comments. Those were removed in 1.1.0, so the page
  pointed at something that no longer existed.
- The 101 guide's Stripe payment link is deactivated; the entry now shows
  "Coming soon" everywhere rather than linking to a dead checkout.
- The members' resources override never fired: it was keyed on `entry.slug`,
  but content-layer entries loaded by `glob()` carry an `id` and no `slug`,
  so every override silently fell through to the public `downloadUrl`.
  Members were being sent to the purchase link the override existed to
  prevent.

## [1.1.0] - 2026-08-23

### Fixed
- The `STRIPE_SECRET_KEY` stored in Cloudflare was not a valid Stripe
  secret key, so every server-side Stripe API call had been failing
  silently. Replaced with the real key; the payments sync and webhook
  subscription lookups now work.
- Stripe webhook now verifies the purchased product before granting Collective
  membership. Previously any checkout on the account (webinar, guide, donation)
  enrolled the buyer as a member. Requires the new
  `STRIPE_COLLECTIVE_PRODUCT_ID` secret; until it is set the webhook grants
  nothing and emails the admin.

### Fixed
- First-time profile setup no longer offers a Cancel escape (and no longer
  pre-fills the name field with the server's "Member" placeholder), so a new
  member can't skip naming themselves and get re-prompted on every login.

### Changed
- Portal redesign round 2 (from live testing): the purple hero banner is
  gone from all member pages — the sidebar and content now fill the screen
  app-style, with a wider (260px) sidebar, larger nav type and compact
  in-page headings. Sign-in lands on the Start here welcome screen.
- First sign-in now asks each member to read and accept the community
  guidelines; acceptance is stored per member (`guidelines_accepted_at`).
- Event creation moved out of the members' Events page into Guru →
  Collective (add, list upcoming, cancel); members just see events.
- "Alerts" renamed to "Notifications" throughout the portal.
- Resources open PDFs in a new tab instead of forcing a download; the
  101 guide shows "Coming soon" for members instead of a purchase link.

### Added
- Guru → Newsletter → **System emails**: the transactional emails (Collective
  welcome, sign-in links, suspended/non-member notices, newsletter welcome)
  are now editable templates with placeholders, live preview and
  restore-to-default. Stored in a new `email_templates` D1 table; the coded
  defaults apply until edited.
- Circle-style portal layout: left sidebar with spaces (Start here,
  Say hello, admin-only Announcements), Events, Resources, Webinar,
  Members and Alerts. The feed is the landing view; posts carry a space
  chip on the home feed.
- Country on member profiles (ISO dropdown); flag shown beside names in
  the feed, comments and directory.
- Members' Resources page (from the content collection, with the paid
  guide included free) and Webinar page (recordings embedded).
- Removed per-post/comment Report buttons in favour of messaging the
  team directly; fixed [hidden] being overridden by display rules, the
  true cause of the profile editor appearing on every sign-in.
- Guru **Payments** tab: donation totals per donor, Collective MRR and
  member counts, and a full payment history — backed by a new `payments`
  mirror table in D1, fed live by the Stripe webhook and backfillable with
  a one-click "Sync from Stripe".
- Guru **Collective** tab: invite comped members, suspend/reactivate,
  email one-time sign-in links, see plan/location/last-seen per member,
  and resolve open reports.
- Optional passwords for Collective members: set or change one from the
  profile editor, sign in with it at `/collective/login/` (PBKDF2-hashed,
  never required — the magic link keeps working and doubles as the
  forgot-password path). Sessions extended from 30 to 180 days so members
  stay signed in on a device until they sign out.
- Admins can email any member a fresh one-time sign-in link
  (`send_login_link` action on the member admin API).
- Test environment at `test.montessoriforadolescents.com`: a "Sign in" pill
  appears in the navigation on the test subdomain (and localhost) only, and
  the whole test host is served with `X-Robots-Tag: noindex, nofollow`.
  Production keeps the Collective hidden until launch.
- `ROADMAP.md` — the working list for the Collective rollout.

## [1.0.0] - 2026-04-11

### Added
- Guru admin backend at `/guru` with Cloudflare Pages Functions
- Blog editor with markdown preview, draft management, and publish to GitHub
- Newsletter composer with visual/HTML editor, templates, and batch sending via Resend
- Subscriber management with signup, unsubscribe, and admin listing
- Blog comment system with public submission and admin moderation
- Multi-tab notes editor for admin use
- Dashboard with stats (subscribers, drafts, published posts, pending comments)
- Campaign history tracking
- Image upload support via Cloudflare R2 (presigned URLs)
- Newsletter subscribe form in site footer
- Comment section on blog post pages
- HMAC-secured unsubscribe links
- Admin notifications for new subscribers and comments
- Resend webhook handler for bounce/complaint auto-unsubscribe
- D1 database schema for all data storage
- SETUP.md with deployment instructions for Cloudflare Pages
- Cloudflare Access protection for admin panel
