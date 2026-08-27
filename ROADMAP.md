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

## Phase 5 — direct messages (2026-08-24)
- [x] One-to-one private conversations, sidebar entry with unread badge,
      Message button on member cards. `schema/messages.sql` applied to
      production.
- [x] Private by default — no admin endpoint reads messages. Mute (silent,
      one-directional) and Report a conversation (the only thing that
      surfaces a thread) both shipped.
- [x] Email on a new conversation or when the recipient had caught up;
      template `member-new-message`, editable in Guru.
- [ ] **Not yet tested end to end by a human.** Needs two signed-in members
      — Jarin plus the Bijan Test account. Check: send, reply, unread badge
      clears, email arrives, mute stops delivery, report reaches Guru.

## For Bijan to review (added 2026-08-27)

Everything below is either untested by a human, or a decision that isn't
mine to make. Grouped by what it needs.

### Needs a human test — nothing here has been exercised end to end
Claude can't hold a member session, so all of this is verified only as far
as "builds, deploys, endpoints refuse when signed out". Two accounts are
needed (Jarin + the Bijan Test member).

- [ ] **Direct messages.** Send, reply, unread badge appears then clears,
      notification email actually arrives, mute silently stops delivery,
      Report reaches Guru. Reached from Members → "Your conversations",
      not the main sidebar.
- [ ] **Document folders.** Upload a PDF, a Word file and an image;
      rename a folder; delete a document; reorder folders with the arrows.
- [ ] **PDF preview specifically.** Member media is served with a sandbox
      CSP and `nosniff` — correct for security, but it can interfere with
      a browser's built-in PDF viewer. If Preview opens blank, that's the
      cause and the headers need a narrow exception for this one case.
- [ ] **Word/Excel/PowerPoint download** — these can't preview, so they
      offer Download only. Confirm the file opens cleanly after saving.

### Bugs found and fixed this session — worth a second pair of eyes
- **Scoped CSS never reached script-built elements.** Astro stamps
  `data-astro-cid` on elements it compiles from the template; anything
  made with `createElement` doesn't get it, so scoped rules miss entirely.
  The Resources table rendered as raw unstyled text. `messages.astro` had
  the same defect throughout. Both fixed with `:global()` anchored to a
  template element, matching the pattern already in `members.astro`.
- **`.form-error` in `portal.astro`** had the same problem: the reply
  composer builds one at runtime, so the error under a failed comment
  reply rendered unstyled. Fixed the same way.
- Audited every portal page for further instances — `portal`, `events`,
  `alerts`, `members`, `resources`, `messages` all now clean. Worth
  knowing the pattern: **any class you create in JS needs `:global()`.**
- **The members' resources override was keyed on `entry.slug`**, but
  content-layer entries loaded by `glob()` carry an `id` and no `slug`,
  so it silently never fired. Worth grepping for other `.slug` uses on
  content entries.

### Decisions for Jarin and Bijan, not for Claude
- [ ] **The Collective banner** is built and sitting unmerged on branch
      `collective-hero` — a logo-led chocolate/terracotta hero. It clashes
      with the deliberate "app, not brochure" call to drop heroes from the
      portal pages. Options discussed: door pages only (login, verify,
      welcome, guidelines), drop it, or reinstate everywhere.
- [ ] **The guidelines no longer list prohibited conduct.** "What isn't
      allowed" was removed at Jarin's request, along with the photo
      family-permission paragraph. Since the guidelines are the acceptance
      gate new members must tick, there is now nothing written that a
      removal decision would rest on, and no mention of family consent
      anywhere. Deliberate — flagged so it isn't a surprise later.
- [ ] **The Collective hero photo shows three identifiable young people**
      and `/collective/` is public and indexed. Confirm family permission
      covers public web use, or swap the photo back.
- [ ] **Webinar recordings are no longer free to members** (page deleted
      2026-08-27). Two loose ends: the old page can persist in Cloudflare's
      edge cache for up to 7 days (`s-maxage=604800`) — purge if that
      matters; and the recording is an **unlisted, not private** YouTube
      video, so anyone who already opened that page can still watch it.
      Setting it to Private is the only real fix.

### Still open from before
- [ ] Verify the webhook replay in Stripe (Phase 0) — replay the
      2026-08-20 event, confirm it is now skipped.
- [ ] Test domain is crawlable: `test.montessoriforadolescents.com` serves
      `Allow: /`, has no `noindex`, and its sitemap responds 200. That is
      the whole site duplicated on a second domain. Phase 1 item, still open.
- [ ] The room is empty and there is no launch audience: 1 post, 0
      comments, 0 waitlist signups, ~10 mailable non-donor subscribers.
      This is the actual launch blocker, not the code.

### Launch switches, when the above is settled
`OPEN` in `src/pages/collective/index.astro`, and `SHOW_COLLECTIVE` in
`src/components/global/Navigation.astro`. Both currently false. Delete
`src/pages/collective/preview.astro` at the same time — `/collective/`
will be showing the same page.

## Later (marked, not scoped)
- [ ] **Pen pal exchange programme** — details to come.
- [ ] **Courses** — sellable course support if one launches.

## Notes
- CHANGELOG.md already exists — every change gets an entry there.
- Stripe is already connected in production (`STRIPE_SECRET_KEY` +
  `STRIPE_WEBHOOK_SECRET` set, webhook proven working 2026-08-20).
- Root `*.md` files are gitignored by default; ROADMAP.md must be whitelisted
  in .gitignore before committing.
