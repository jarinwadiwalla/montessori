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
- [ ] Left-hand sidebar spaces: Start Here, Say Hello, Events & Announcements
      (feed remains the landing view after login). Per the Circle screenshot
      (2026-08-23): left sidebar nav ONLY — no top bar tabs, no Trending
      posts column.
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
