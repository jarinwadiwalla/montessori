# Collective rollout roadmap

Working list agreed 2026-08-23. Iterate top to bottom; move finished items to
CHANGELOG.md with the version they shipped in.

## Phase 0 — before anything else
- [ ] **Fix the Stripe webhook product filter** (HANDOFF.md §5). Any checkout on
      the account currently enrols the buyer as a Collective member. Must land
      before more traffic flows.
- [ ] Resolve the one accidentally-enrolled member (invite early, or remove +
      personal note).

## Phase 1 — private test environment
- [ ] Add `test.montessoriforadolescents.com` as a custom domain on the Pages
      project. Gate by hostname: on the test domain the nav shows the
      login link (→ `/collective/login/`) and the portal is open; on the main
      domain the Collective stays Coming Soon. One deploy, two behaviours.
- [ ] Keep test domain `noindex` + disallowed in robots.txt.
- [ ] Hand-add a few test members (comped, via admin-members API or /guru).

## Phase 2 — auth changes
- [ ] Password on first login: member sets a password during profile setup;
      stays logged in after browser restarts (long-lived session).
- [ ] "Forgot password" flow (reuses the magic-link machinery).
- [ ] Admin option in /guru to send a one-time login link to any member.
- [ ] **Bug:** profile setup re-prompts on every login even when a profile
      exists — fix so it only shows when name is missing or member clicks Edit.

## Phase 3 — /guru admin additions
- [ ] **Donors tab**: show amount donated per person (pull from Stripe; store
      payments in D1 so amounts survive and can be summed).
- [ ] **Subscriptions section**: who pays $5/mo or $50/yr, status, MRR.
- [ ] **Portal admin inside /guru**: invite (comped) members, suspend/remove,
      see who joined and from where (country), see churn.

## Phase 4 — portal features (Circle-inspired)
- [ ] Left-hand sidebar spaces: Start Here, Say Hello, Events & Announcements
      (feed remains the landing view after login).
- [ ] Downloadable resources section (PDFs etc., served through the
      authenticated media route).
- [ ] Webinar section (the existing webinar recording, members-only).
- [ ] Profile: photo + name + **country**; show a flag next to the name
      everywhere the member appears.
- [ ] Subtle in-app notifications: alert only on @mentions; list of people
      messaging you / admin announcements. (Alerts page exists; refine UX.)
- [ ] Replace the report button with "message the admin" for issues.

## Later (marked, not scoped)
- [ ] **Pen pal exchange programme** — details to come.
- [ ] **Courses** — sellable course support if one launches.

## Notes
- CHANGELOG.md already exists — every change gets an entry there.
- Stripe is already connected in production (`STRIPE_SECRET_KEY` +
  `STRIPE_WEBHOOK_SECRET` set, webhook proven working 2026-08-20).
- Root `*.md` files are gitignored by default; ROADMAP.md must be whitelisted
  in .gitignore before committing.
