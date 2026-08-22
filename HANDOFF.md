# Project handoff — Montessori for Adolescents

Written 2026-08-23. A single place to pick this up cold on another machine.
Everything below was verified against production on that date unless marked
otherwise.

> **This repo is public.** No email addresses, member names, secrets or API
> keys appear in this file, and none should be added to it. Where a real
> person is involved, look them up in the D1 database or the Stripe
> dashboard instead.

---

## 1. The stack in one breath

A static **Astro** site deployed to **Cloudflare Pages** (project name
`montessori`), with dynamic behaviour supplied by **Cloudflare Pages
Functions** in `functions/`. Data lives in **D1** (`montessori-db`, bound as
`SITE_DB`), uploads live in **R2** (`montessori-media`, bound as
`MEDIA_BUCKET`). Transactional email goes out through **Resend**; money comes
in through **Stripe payment links**.

Live at <https://montessoriforadolescents.com>.

**Deploys happen automatically on push to `main`.** There is no GitHub Actions
workflow — Cloudflare Pages watches the repo. Build output is `./dist`.

```bash
npm run dev      # local dev server
npm run build    # production build
```

Note: the host serves the **homepage with HTTP 200 for unknown URLs**, because
there is no `src/pages/404.astro`. When verifying a deploy, check the page
*title*, never the status code.

### Config files worth knowing

| File | What it controls |
|---|---|
| `astro.config.mjs` | site URL, redirects, sitemap exclusion rules |
| `wrangler.jsonc` | Pages project name, D1 and R2 bindings |
| `public/robots.txt` | keeps `/guru/` and the private Collective pages out of search |
| `.gitignore` | note the `/*.md` rule — root markdown is ignored unless whitelisted |

---

## 2. `/guru` — the admin panel

A private dashboard at `/guru/`, built as plain HTML + JS in
`public/guru/index.html` with its scripts in `public/guru/js/`. It is
`Disallow`ed in robots.txt and authenticated with an admin token fetched from
`/api/admin-session`.

Six tabs:

- **Dashboard** — subscriber count, draft/published counts, pending comments, recent campaigns
- **Blog** — markdown editor with formatting buttons, cover-image and inline-image upload, autosave, draft/preview/publish. Publishing commits back to the GitHub repo (hence the `GITHUB_*` secrets)
- **Newsletter** — visual or raw-HTML composer, saved templates, test sends, campaign history, retries
- **Subscribers** — the list, segmented by `tier`
- **Comments** — moderation queue for blog comments
- **Notes** — scratch notes

This is the whole publishing and administrative surface. Day-to-day content
work should never require touching code.

### Subscriber tiers

The `subscribers` table has a `tier` column, and the distinction matters:

- `subscriber` — the general newsletter list
- `donor` — **deliberately excluded from "All Subscribers" sends.** This is intentional, not a bug. Do not "fix" it.
- `collective` — Collective members, added automatically when they join
- `waitlist` — people who signed up on the Coming Soon page. Also kept out of general sends on purpose; they asked about the Collective, not the newsletter.

Newsletter templates are **live rows in D1**. The `schema/seed-template-*.sql`
files are stale snapshots — read the database, not those files, if you need to
know what a template currently looks like.

---

## 3. The Collective — what it is and why we built it

The Montessori Adolescent Collective is a small paid community for adolescent
practitioners. We evaluated **Circle** and chose not to pay for it, so this is
a from-scratch replacement built into the existing site.

**Status: fully built, merged to `main`, deployed — and deliberately switched
off.** `/collective/` currently serves a Coming Soon page with a waitlist form.

### What exists

**Membership and billing**
- Recurring dues: **$5/month or $50/year** (twelve months for the price of ten). Decided 2026-08-17; this was settled after weighing the payment-processing-fee objection to $5, so it does not need relitigating.
- Two live Stripe payment links, already pasted into `src/components/collective/LandingContent.astro`.
- Webhook-driven lifecycle at `functions/api/community/stripe-webhook.js`: join, renew, plan change, cancel, lapse.
- **3-day grace period** on a failed card, then the Collective goes on hold with a page explaining how to fix it. Nothing they posted is deleted.
- Stripe customer portal for self-serve card updates, plan switches and cancellation (set to cancel *at end of billing period*, matching what the site promises).
- Anyone added by hand has no subscription attached and is therefore **comped forever** — that is how the team gets in free.

**Identity**
- **Magic-link sign-in. There are no passwords anywhere in this system.** A member enters their email at `/collective/login/` and receives a single-use link that expires in 20 minutes.
- Login tokens and session tokens are stored **only as SHA-256 hashes**, so a stolen copy of the database still does not let anyone sign in as a member.

**The portal itself** (`src/pages/collective/`)
- **Board** (`portal.astro`) — posts with image and PDF uploads plus YouTube/Vimeo embeds, threaded comments
- **Events** (`events.astro`) — three kinds (gathering, presentation, retreat), one-click RSVP, capacity limits that close the button when full, timezone notes, cancel-rather-than-delete
- **Members** (`members.astro`) — directory with photo, location and bio, plus an "open to exchanges and pen pal programmes" badge and filter. **Email addresses are never sent to other members' browsers.**
- **Alerts** (`alerts.astro`) — `@mention` notifications delivered in-app with an unread badge, deliberately *not* by email, so a busy thread cannot flood anyone's inbox
- **Guidelines** (`guidelines.astro`) — public, indexed on purpose

**Moderation**
- Report button on every post and comment; reports email the admin and appear in an admin list
- Admins can delete any post or comment from inside the portal
- Suspending a member signs them out everywhere immediately and blocks access while preserving their history

**Privacy posture**
- Member uploads are served through `functions/community-media/[[path]].js`, which returns 404 to anyone not signed in. They are not on the public web.
- Portal pages carry `noindex`, are excluded from the sitemap by an allow-list in `astro.config.mjs` (so a newly added page is private by default), and are blocked in robots.txt.
- `/collective/` and `/collective/guidelines/` stay public and indexed on purpose — that is how people find and understand the Collective.

### Database

Ten tables, all created by `schema/community.sql`:

`community_members`, `community_login_tokens`, `community_sessions`,
`community_posts`, `community_attachments`, `community_comments`,
`community_reports`, `community_events`, `community_event_rsvps`,
`community_notifications`.

---

## 4. Production status, verified 2026-08-23

| Check | Result |
|---|---|
| Schema applied to production D1 | ✅ all 10 `community_*` tables present, including the newer `community_notifications` |
| `STRIPE_SECRET_KEY` set | ✅ |
| `STRIPE_WEBHOOK_SECRET` set | ✅ |
| Stripe webhook actually working | ✅ proven — it processed a real payment on 2026-08-20 |
| `ADMIN_TOKEN` set | ✅ (this matters — see §6) |
| Team seeded | ✅ all three of us present, `role=admin`, real emails, headshots, comped |
| `/collective/` live | ✅ serving Coming Soon |
| Waitlist endpoint | ✅ alive and validating |

Current contents: **1 event** ("Inaugural Gathering!", 2026-09-25), **0 posts**,
**0 comments**, **0 waitlist signups**, 3 admins + 1 unintended member (§5).

All seven steps of `COMMUNITY-PORTAL-SETUP.md` are complete. That document is
still the click-by-click reference for *how* each piece was set up.

---

## 5. ⚠️ Known bug — the webhook grants membership for **any** Stripe checkout

**This is the most important thing in this file.**

`handleCheckout()` in `functions/api/community/stripe-webhook.js` does **not
check which product was purchased.** It reacts to every
`checkout.session.completed` event on the entire Stripe account. Since the
Collective webhook endpoint was added, that means **any** purchase — a webinar
recording, the Montessori 101 guide, a donation — silently enrols the buyer as
a Collective member.

**This has already happened once.** On 2026-08-20 someone bought the **webinar
recording** ($45, less the $20 `COMMUNITY` promo code = **$25**) and was
enrolled in the Collective. Their identity is in the `community_members` table
and in Stripe; it is deliberately not written here.

What happened to them as a result:

1. Given a Collective membership record with **one year of access**
2. Added to the mailing list as `tier = 'collective'`, so they would receive Collective mailings
3. Sent a **"welcome to the Collective" email containing a working sign-in link** — for a community that publicly says "Coming Soon"

The `$25` amount is what made this look, at first glance, like an old one-off
Collective price rather than a foreign product. It is not. There is no stray
$25 Collective link. **Do not go hunting in Stripe for one.**

### Why it failed the way it did

The code has a safety net for a *misconfigured Collective price*: if money
arrives with no subscription attached, rather than leaving `subscription_id`
blank (which would mean "comped" and therefore free access forever), it grants
one year, sets `plan = 'one_time'`, and emails the admin address with the
subject *"Check your Stripe pricing — a payment arrived without a
subscription"*. That alert went out on 2026-08-20.

That net did its job — it capped the damage at one year instead of a lifetime.
But it was designed for the wrong failure. It assumes any payment reaching this
webhook was *meant* to be a Collective payment. That assumption is the bug.

### The fix

In `handleCheckout()`, before granting anything, confirm the purchase is
actually for the Collective product, and ignore the event otherwise:

```js
// after the payment_status check, before touching the members table
const items = await fetchLineItems(env, session.id);
const isCollective = items.some(
  (i) => i.price?.product === COLLECTIVE_PRODUCT_ID
);
if (!isCollective) {
  return Response.json({ received: true, skipped: "not a Collective purchase" });
}
```

`fetchLineItems` follows the same shape as the existing `fetchSubscription`
helper at line ~275 — a `GET` to
`https://api.stripe.com/v1/checkout/sessions/{id}/line_items` with
`Authorization: Bearer ${env.STRIPE_SECRET_KEY}`. Read the Collective product
ID out of the Stripe dashboard (Product catalog → Montessori Adolescent
Collective) and put it in a constant at the top of the file, or better, a
`STRIPE_COLLECTIVE_PRODUCT_ID` secret.

Keep the existing `one_time` safety net *after* that check — once the product
is confirmed to be the Collective, "no subscription attached" really does mean
a misconfigured price, which is exactly what that branch is for.

**Test it** by replaying the 2026-08-20 event from Stripe → Developers →
Webhooks → the endpoint → Events, and confirming it is now skipped.

### Cleaning up the person already affected

Decide and then act:

- **Invite them in early** as a founding member and leave the record, or
- **Remove the membership**, set their subscriber `tier` back to `subscriber`,
  and re-invite at launch.

They have never signed in — `last_seen_at` is empty — so nothing has been lost
either way. Whichever you choose, a short personal note is warranted: they
received a welcome email for something they did not buy.

---

## 6. Opening the Collective to the public

Once §5 is fixed — and it should be fixed first, because opening the doors
multiplies the number of checkouts flowing through that webhook:

1. Set `OPEN = true` at `src/pages/collective/index.astro:12`. The full landing
   page returns exactly as it was; it is preserved intact in
   `src/components/collective/LandingContent.astro` and nothing was deleted.
2. Unhide the navigation link in `src/components/global/Navigation.astro`
   (there is a comment there marking the deliberate omission).
3. Push to `main`. Cloudflare deploys automatically.
4. Email the `waitlist` tier from Guru to tell them it is open.

Worth doing before you open: seed a few posts and another event or two, so the
room is not empty when the first members arrive.

---

## 7. Open items

**Collective**
- Fix the webhook product filter (§5) — do this before opening
- Resolve the affected member (§5)
- Seed some posts; only one event currently exists

**SEO and content** (all require dashboard access, not code)
- Set up **Google Search Console**, submit `https://montessoriforadolescents.com/sitemap-index.xml`; same for Bing Webmaster Tools
- Use the Search Console **Removals** tool on `/webinars/<id>/watch/` if it was indexed before it gained `noindex` on 2026-08-17
- **Publish more blog posts** — only two exist, and depth is the real ranking lever
- Add real social profile URLs to `sameAs` in `src/components/global/SEOHead.astro` (currently only Buy Me a Coffee)
- One real test purchase of the webinar recording, to confirm the Stripe redirect lands on the watch page

**Code health, not urgent**
- `requireAdmin` in `functions/lib/auth.js` **fails open** when `ADMIN_TOKEN` is unset — it returns "authorized". 17 endpoints depend on it. `ADMIN_TOKEN` **is** set in production, so nothing is exposed today; this is a latent risk, not a live hole. A fail-closed `requireAdminStrict` already exists and is used by the Collective's member admin. Migrating the other 17 is the right cleanup, and was skipped only to avoid breaking Guru blind.
- No `src/pages/404.astro`, so unmatched URLs soft-404 with the homepage.

---

## 8. Secrets and private data

Production secrets live on the Cloudflare Pages project and are listed with:

```bash
npx wrangler pages secret list --project-name montessori
```

Currently set: `ADMIN_EMAIL`, `ADMIN_TOKEN`, `CDN_URL`, `GITHUB_OWNER`,
`GITHUB_REPO`, `GITHUB_TOKEN`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET`.

Values cannot be read back out of Cloudflare — only overwritten. If you need
one on a new machine, get it from the originating service, not from here.

**Things that must never be committed** (all currently gitignored, keep it that
way):
- `schema/*.local.sql` — the real team seed, contains real email addresses
- `MFA Donors - Sheet1.pdf` in the repo root — donor names and emails
- `.dev.vars` — local secrets for `wrangler pages dev`
- Loose photos, PDFs and exports in the repo root

---

## 9. Useful commands

```bash
npx wrangler d1 execute montessori-db --remote --command "SELECT ..."
```

```bash
npx wrangler pages secret put SOME_SECRET --project-name montessori
```

Add a member by hand (they become comped and never lapse):

```bash
curl -X POST https://montessoriforadolescents.com/api/community/admin-members \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"them@example.com","name":"Their Name"}'
```

Suspend or reactivate someone (history is preserved either way):

```bash
curl -X PUT https://montessoriforadolescents.com/api/community/admin-members \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"THEIR_MEMBER_ID","action":"suspend"}'
```

---

## 10. Related documents

- `COMMUNITY-PORTAL-SETUP.md` — click-by-click Stripe and Cloudflare setup, and a plain-English "how it works day to day" section
- `CLOUDFLARE-SECRETS-SETUP.md` — secrets walkthrough
- `SETUP.md` — original site setup
- `CHANGELOG.md`
