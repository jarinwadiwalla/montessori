# Changelog

## [1.1.0] - 2026-08-23

### Fixed
- Stripe webhook now verifies the purchased product before granting Collective
  membership. Previously any checkout on the account (webinar, guide, donation)
  enrolled the buyer as a member. Requires the new
  `STRIPE_COLLECTIVE_PRODUCT_ID` secret; until it is set the webhook grants
  nothing and emails the admin.

### Fixed
- First-time profile setup no longer offers a Cancel escape (and no longer
  pre-fills the name field with the server's "Member" placeholder), so a new
  member can't skip naming themselves and get re-prompted on every login.

### Added
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
