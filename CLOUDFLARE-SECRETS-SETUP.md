# Cloudflare Pages Secrets Setup

Run these commands from a machine that has access to the Cloudflare account hosting the montessori site.

## Prerequisites

```bash
npm install -g wrangler
wrangler login
```

## Set Required Secrets

Replace `PROJECT_NAME` with the actual Cloudflare Pages project name (check your dashboard under Workers & Pages).

### 1. Resend API Key

```bash
wrangler pages secret put RESEND_API_KEY --project PROJECT_NAME
```

When prompted, paste your Resend API key (get from https://resend.com/api-keys).

**Note:** The original key shared in conversation has been rotated. Use the new key from Resend dashboard.

### 2. Unsubscribe Secret (HMAC signing key)

```bash
wrangler pages secret put UNSUBSCRIBE_SECRET --project PROJECT_NAME
```

When prompted, paste this pre-generated secret:

```
fa90acecf63a5884847580359d24d3c1b5a3351b97b90b96678c8ec8a4bac527
```

### 3. Admin Email

```bash
wrangler pages secret put ADMIN_EMAIL --project PROJECT_NAME
```

When prompted, enter:

```
montessoriforadolescents@gmail.com
```

## Set Up Resend Webhook

In the Resend dashboard (https://resend.com/webhooks):

1. Add endpoint URL: `https://montessoriforadolescents.com/api/resend-webhook`
2. Select events: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
3. Save and copy the signing secret (starts with `whsec_`)

Then set the webhook secret:

```bash
wrangler pages secret put RESEND_WEBHOOK_SECRET --project PROJECT_NAME
```

When prompted, paste the signing secret from Resend.

## Run Database Migration

After deploying the latest code, run the schema migration to add new tables and columns:

```bash
wrangler d1 execute montessori-db --file=schema/migrate-newsletter.sql --remote
```

## Verify

After setting secrets and deploying:

1. Go to `/guru/` and navigate to Newsletter
2. Try sending a test email to `jarin.wadiwalla@gmail.com` or `bijanrahnamai@gmail.com`
3. Check Resend dashboard for delivery confirmation
