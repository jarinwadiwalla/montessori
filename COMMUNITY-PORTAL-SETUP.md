# Montessori Adolescent Collective — setup guide

The code is built and tested. These are the steps only you can do, because
they need your Stripe and Cloudflare accounts. Do them in order.

Nothing is live until step 7.

---

## 1. Create the database tables

This adds the Collective's tables to your existing database. It does not
touch your subscribers, blog, or newsletter data.

```bash
npx wrangler d1 execute montessori-db --remote --file schema/community.sql
```

You should see a list of `"success": true` results.

---

## 2. Create the Stripe product and its two prices

Membership runs on recurring dues: $5 a month, or $50 a year (twelve months
for the price of ten). Both are **subscriptions** — the yearly one simply
renews once a year instead of monthly. That keeps access rules identical for
everyone and means yearly members renew automatically.

1. Go to **Stripe Dashboard → Product catalog → + Add product**
2. Name: `Montessori Adolescent Collective`
3. First price: **$5.00**, **Recurring**, billing period **Monthly** → **Save**
4. On the product page, click **+ Add another price**
5. Second price: **$50.00**, **Recurring**, billing period **Yearly** → **Save**

Now make a payment link for each price:

6. On the product page, next to the **monthly** price, click
   **Create payment link**
7. Under **After payment**, choose **Don't show confirmation page** →
   **Redirect customers to your website**, and enter:
   `https://montessoriforadolescents.com/collective/welcome/`
8. Under **Options**, tick **Collect customers' names**
9. **Create link**, then copy it — this is your monthly link
10. Repeat steps 6–9 for the **yearly** price to get your yearly link

---

## 3. Turn on the billing portal

This is what lets members change their card, switch between monthly and
yearly, or cancel — without emailing you. It matters more with recurring
dues than it did with a one-off payment.

1. Go to **Stripe Dashboard → Settings → Billing → Customer portal**
2. Turn on **Customers can update payment methods**
3. Turn on **Customers can cancel subscriptions**, and set it to
   **At end of billing period** (not immediately — this matches what the
   site promises them)
4. Turn on **Customers can switch plans**, and allow both your prices
5. **Save**

---

## 4. Connect Stripe to the portal (webhook + keys)

This is what grants access when someone pays, and removes it when dues stop.

1. Go to **Stripe Dashboard → Developers → Webhooks → + Add endpoint**
2. Endpoint URL:
   `https://montessoriforadolescents.com/api/community/stripe-webhook`
3. Under **Select events**, choose these **four**:
   - `checkout.session.completed` — someone joined
   - `invoice.paid` — a renewal went through
   - `customer.subscription.updated` — plan change, cancellation, payment trouble
   - `customer.subscription.deleted` — membership ended
4. Click **Add endpoint**
5. Find **Signing secret** → **Reveal** → copy it (starts with `whsec_`)
6. Also go to **Developers → API keys** and copy your **Secret key**
   (starts with `sk_live_`)
7. Run each of these and paste the matching value when prompted:

```bash
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name montessori
```

```bash
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name montessori
```

**Both are required.** Without the webhook secret, every webhook is
refused — deliberately, because otherwise anyone could send a fake "they
paid" message and let themselves in free. Without the secret key, the
billing portal won't open and renewal dates won't be recorded.

Treat the secret key like a password: don't paste it into email or chat.

---

## 5. Put your payment links on the page

Open `src/pages/collective/index.astro`. Near the top you'll see:

```js
const monthlyPrice = 5;
const annualPrice = 50;
const monthlyLink = 'https://buy.stripe.com/...';
const annualLink = 'https://buy.stripe.com/...';
```

Both links are already filled in. If you ever change a price in Stripe you
will need a new payment link, and it goes here. The "Save $10" badge works itself out
from those two numbers. Until you fill the links in, both buttons show
"Opening shortly" rather than breaking.

---

## 6. Add the team (and make yourself an organiser)

This puts you, Alex and Lola in the member directory with your headshots
and bios from the website, so the room isn't empty on day one. It also
makes you an organiser, which is what lets you add events and remove any
post or comment.

Run the **`.local.sql`** version — it already has everyone's real email
addresses in it:

```bash
npx wrangler d1 execute montessori-db --remote --file schema/seed-collective-team.local.sql
```

> **Why two files.** This repo is public, so real email addresses can't be
> committed to it — they'd be readable by anyone and scraped by spam bots.
> The committed `seed-collective-team.sql` keeps placeholders; the
> `.local.sql` file sits on your computer only and is gitignored. Don't
> commit it, and don't paste its contents anywhere public.

Safe to run more than once — it updates rather than duplicates.

Then sign in at `/collective/login/` with your address.

All three of you are organisers, so you can each add events and remove any
post or comment. The command to step someone back to an ordinary member is
at the bottom of that same file.

---

## 7. Go live

The portal is on a branch called `community-portal`, so it is **not** on your
live site yet. When you're ready:

```bash
git checkout main && git merge community-portal && git push origin main
```

---

## How it works day to day

**Someone joins:** they pay → Stripe tells the site → they're added → they get
a welcome email with a sign-in link. You get a "new member" email.

**Dues and renewals:** monthly and yearly members renew automatically. You
don't do anything — Stripe collects, tells the site, and access continues.

**If a payment fails:** the member keeps access for 3 more days while Stripe
retries the card. After that the Collective goes on hold for them: they see a
page explaining it with a button to update their card, and nothing they posted
is deleted. Fixing the card restores everything immediately.

**If someone cancels:** they keep access until the end of the period they've
already paid for, then it lapses. They can cancel themselves from **Billing**
inside the Collective, so it shouldn't reach your inbox.

**You and the team don't pay dues.** Anyone added by hand — you, Alex, Lola,
anyone you comp — has no subscription attached and never lapses.

**Signing in:** there are no passwords. A member enters their email at
`/collective/login/` and gets a link that works once and expires in 20 minutes.

**Posting:** members write a post, optionally attaching images or PDFs, or
pasting a YouTube/Vimeo link. Posts appear immediately. Others comment below.

**Events:** the Events page covers all three kinds — monthly gatherings,
guest presentations, and in-person retreats. Only organisers see the "Add
an event" form. Fill in the type, title, date and time, where it is, and a
link; members then RSVP with one click. Use the *Time note* field for
something like "9am SGT / 6pm PDT" so people in other timezones aren't
guessing. Set a capacity for retreats and the RSVP button closes itself
once it's full. Cancelling keeps the event visible, marked as cancelled,
so anyone who RSVP'd can see what happened.

**Members & pen pals:** the Members page lists everyone with their photo,
place and a line about their work. Members who tick "open to exchanges and
pen pal programmes" in their profile get a badge, and there's a filter to
show only those people — that's how exchanges get started. Email addresses
are never shown; people connect through the board.

**Moderation:** every post and comment has a **Report** button. Reports email
you and appear in the admin list. As an admin you can delete any post or
comment directly in the portal.

**Removing someone:** suspending a member signs them out everywhere
immediately and blocks their access, but keeps their history:

```bash
curl -X PUT https://montessoriforadolescents.com/api/community/admin-members \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"THEIR_MEMBER_ID","action":"suspend"}'
```

Use `"action":"reactivate"` to undo it.

**If a payment doesn't register:** you can add someone by hand:

```bash
curl -X POST https://montessoriforadolescents.com/api/community/admin-members \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"them@example.com","name":"Their Name"}'
```

---

## What's private

- Member uploads are served only to signed-in members. They are not on the
  public web and search engines cannot reach them.
- `/collective/portal/`, `/login/`, and `/verify/` carry `noindex`, are
  excluded from your sitemap, and are blocked in `robots.txt`.
- A member's email address is never sent to other members' browsers.
- The public `/collective/` and `/collective/guidelines/` pages stay indexed
  on purpose — those are how people find and understand the Collective.

## What is stored

Members' email, chosen display name, optional photo and bio, their posts and
comments, and which Stripe payment let them in. There are no passwords in the
system at all. Sign-in links and session tokens are stored only as hashes, so
even a copy of the database would not let someone sign in as a member.
