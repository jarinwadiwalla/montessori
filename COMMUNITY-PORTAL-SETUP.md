# Montessori Adolescent Collective — setup guide

The code is built and tested. These are the steps only you can do, because
they need your Stripe and Cloudflare accounts. Do them in order.

Nothing is live until step 6.

---

## 1. Create the database tables

This adds the Collective's tables to your existing database. It does not
touch your subscribers, blog, or newsletter data.

```bash
npx wrangler d1 execute montessori-db --remote --file schema/community.sql
```

You should see a list of `"success": true` results.

---

## 2. Create the Stripe product

1. Go to **Stripe Dashboard → Product catalog → + Add product**
2. Name: `Montessori Adolescent Collective`
3. Price: **$95.00**, and choose **One-off** (not recurring)
4. Click **Save product**
5. On the product page, click **Create payment link**
6. Under **After payment**, choose **Don't show confirmation page** →
   **Redirect customers to your website**, and enter:
   `https://montessoriforadolescents.com/collective/welcome/`
7. Under **Options**, tick **Collect customers' names**
8. Click **Create link** and **copy the link** — you need it in step 4

> Leave "Allow promotion codes" off unless you want discounts. If you do turn
> it on, see the note in your to-do list about how promo codes work.

---

## 3. Connect the payment to the portal (the webhook)

This is what automatically gives someone access the moment they pay.

1. Go to **Stripe Dashboard → Developers → Webhooks → + Add endpoint**
2. Endpoint URL:
   `https://montessoriforadolescents.com/api/community/stripe-webhook`
3. Under **Select events**, choose **`checkout.session.completed`** (just that one)
4. Click **Add endpoint**
5. On the endpoint page, find **Signing secret** → click **Reveal** → copy it
   (it starts with `whsec_`)
6. In your terminal, run this and paste the secret when prompted:

```bash
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET
```

**This step is required.** Until the secret is set, the webhook refuses every
request — that is deliberate. Without it, anyone could send a fake "they paid"
message and grant themselves free access.

---

## 4. Put your payment link on the page

Open `src/pages/collective/index.astro`. Near the top you'll see:

```js
const stripeJoinLink = '';
```

Paste your payment link from step 2 between the quotes, and change `price`
if you picked a different amount. Until you do this, the page shows
"Joining opens shortly" instead of a broken button.

---

## 5. Add the team (and make yourself an organiser)

This puts you, Alex and Lola in the member directory with your headshots
and bios from the website, so the room isn't empty on day one. It also
makes you an organiser, which is what lets you add events and remove any
post or comment.

**First**, open `schema/seed-collective-team.sql` and replace the two
placeholder email addresses with Alex's and Lola's real ones. Sign-in is
by email, so a wrong address means they can't get in. Yours is already
correct.

Then:

```bash
npx wrangler d1 execute montessori-db --remote --file schema/seed-collective-team.sql
```

Safe to run more than once — it updates rather than duplicates.

Then sign in at `/collective/login/` with your address.

By default Alex and Lola join as ordinary members. If you'd like them to
be able to run events and moderate too, the command to promote them is at
the bottom of that same file.

---

## 6. Go live

The portal is on a branch called `community-portal`, so it is **not** on your
live site yet. When you're ready:

```bash
git checkout main && git merge community-portal && git push origin main
```

---

## How it works day to day

**Someone joins:** they pay → Stripe tells the site → they're added → they get
a welcome email with a sign-in link. You get a "new member" email.

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
