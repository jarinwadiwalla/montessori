# Collective rollout roadmap

Working list agreed 2026-08-23. Iterate top to bottom; move finished items to
CHANGELOG.md with the version they shipped in.

## Phase 0 — before anything else
- [x] **Fix the Stripe webhook product filter** (HANDOFF.md §5). Shipped
      2026-08-23; `STRIPE_COLLECTIVE_PRODUCT_ID` secret set (both plans).
      Still to verify: replay the 2026-08-20 event in Stripe → should skip.
- [x] Resolve the one accidentally-enrolled member — removed 2026-08-23
      (membership + login token deleted, tier back to `subscriber`; they had
      never signed in). Re-invite at launch if they're interested.

## Phase 1 — private test environment
- [ ] Add `test.montessoriforadolescents.com` as a custom domain on the Pages
      project. Gate by hostname: on the test domain the nav shows the
      login link (→ `/collective/login/`) and the portal is open; on the main
      domain the Collective stays Coming Soon. One deploy, two behaviours.
- [ ] Keep test domain `noindex` + disallowed in robots.txt.
- [ ] Hand-add a few test members (comped, via admin-members API or /guru).

## Phase 2 — auth changes
- [x] Passwords (2026-08-23): optional, set/changed in the profile editor,
      password sign-in on the login page. PBKDF2-hashed. Sessions extended
      to 180 days. Verified end-to-end on the test subdomain.
- [x] "Forgot password" = the magic-link button on the login page.
- [x] Admin one-time login link: `send_login_link` API action exists;
      the /guru button for it lands with the Phase 3 portal-admin tab.
- [x] **Bug:** profile re-prompt (2026-08-23) — original cause fixed
      pre-handoff (728a855); closed the remaining Cancel escape hatch for
      first-time members.

## Phase 3 — /guru admin additions
- [x] **Donors tab** (2026-08-23): per-donor totals in Guru → Payments,
      backed by a D1 `payments` mirror (webhook-fed + Stripe sync button).
- [x] **Subscriptions section** (2026-08-23): MRR + monthly/annual counts
      in the Payments stat row; per-member plan in the Collective tab.
- [x] **Portal admin inside /guru** (2026-08-23): Collective tab — invite
      comped members, suspend/reactivate, send login links, location and
      last-seen per member, resolve reports.
- [x] Fixed an invalid `STRIPE_SECRET_KEY` in Cloudflare (was an `mk_`
      value, not a real `sk_live_` key) — server-side Stripe calls had been
      failing silently since the start.

## Phase 4 — portal features (Circle-inspired)
- [x] Left sidebar spaces (2026-08-23): Feed, Start here, Say hello,
      Announcements (admin-post-only), Events, Resources, Webinar, Members,
      Alerts. No top tab bar, no trending column, feed is the landing view.
- [x] Resources page (2026-08-23): built from the content collection;
      paid guide swapped for its file for members.
- [x] Webinar page (2026-08-23): recordings embedded, included with
      membership.
- [x] Country on profiles (2026-08-23): ISO dropdown; flag beside names in
      the feed and directory.
- [x] Subtle notifications: the Alerts page already did exactly this —
      @mention-only, in-app badge, shows who. Kept as is.
- [x] Report buttons removed from posts/comments (2026-08-23); Start here
      tells members to message the team. Backend + Guru reports list kept.

## Later (marked, not scoped)
- [ ] **Pen pal exchange programme** — details to come.
- [ ] **Courses** — sellable course support if one launches.

## Notes
- CHANGELOG.md already exists — every change gets an entry there.
- Stripe is already connected in production (`STRIPE_SECRET_KEY` +
  `STRIPE_WEBHOOK_SECRET` set, webhook proven working 2026-08-20).
- Root `*.md` files are gitignored by default; ROADMAP.md must be whitelisted
  in .gitignore before committing.
