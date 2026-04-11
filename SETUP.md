# Guru Backend Setup Guide

This guide covers deploying the Montessori for Adolescents site with the Guru admin backend to Cloudflare Pages.

## Prerequisites

- Node.js 18+
- Cloudflare account (with Workers/Pages access)
- Wrangler CLI: `npm install -g wrangler`
- Resend account (Professional plan) at https://resend.com
- GitHub Personal Access Token

## 1. Cloudflare Pages Setup

### Connect the repository

1. Go to **Cloudflare Dashboard > Workers & Pages > Create > Pages**
2. Connect your GitHub repository
3. Configure build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Framework preset:** Astro

### Authenticate Wrangler

```bash
wrangler login
```

## 2. D1 Database Setup

### Create the database

```bash
npx wrangler d1 create montessori-db
```

This outputs a `database_id`. Copy it.

### Update wrangler.jsonc

Replace `PLACEHOLDER_DATABASE_ID` in `wrangler.jsonc` with the actual database ID:

```jsonc
{
  "d1_databases": [
    {
      "binding": "SITE_DB",
      "database_name": "montessori-db",
      "database_id": "YOUR_ACTUAL_DATABASE_ID"
    }
  ]
}
```

### Run the schema

```bash
npx wrangler d1 execute montessori-db --file=schema/init.sql --remote
```

## 3. R2 Bucket Setup

### Create the bucket

```bash
npx wrangler r2 bucket create montessori-media
```

### Enable public access (for CDN)

In Cloudflare Dashboard:
1. Go to **R2 > montessori-media > Settings**
2. Enable **Public access** via custom domain or r2.dev subdomain
3. Note the public URL (e.g., `https://media.montessoriforadolescents.com` or `https://pub-xxx.r2.dev`)

### (Optional) Set up a custom domain for R2

1. Add a CNAME record: `media.montessoriforadolescents.com` -> your R2 bucket public hostname
2. In R2 settings, add the custom domain

## 4. Secrets Configuration

Set each secret via Wrangler. These are needed for the admin backend to function:

```bash
# Admin API authentication token (generate a random string)
npx wrangler pages secret put ADMIN_TOKEN
# e.g., enter: a-long-random-string-here

# GitHub Personal Access Token (fine-grained, with Contents write permission for this repo)
npx wrangler pages secret put GITHUB_TOKEN

# GitHub repository owner (org or username)
npx wrangler pages secret put GITHUB_OWNER

# GitHub repository name
npx wrangler pages secret put GITHUB_REPO

# Resend API key
npx wrangler pages secret put RESEND_API_KEY

# HMAC secret for unsubscribe token generation (generate a random string)
npx wrangler pages secret put UNSUBSCRIBE_SECRET

# Admin email for notifications (new subscribers, new comments)
npx wrangler pages secret put ADMIN_EMAIL

# (Optional) R2 CDN URL for image uploads
npx wrangler pages secret put CDN_URL
# e.g., enter: https://media.montessoriforadolescents.com

# (Optional) Cloudflare Turnstile secret key for comment spam prevention
npx wrangler pages secret put TURNSTILE_SECRET_KEY
```

### Generating tokens

For `ADMIN_TOKEN` and `UNSUBSCRIBE_SECRET`, generate random strings:

```bash
openssl rand -hex 32
```

### GitHub Token

Create a fine-grained PAT at https://github.com/settings/tokens?type=beta:
- **Repository access:** Select the montessori repository
- **Permissions:** Contents (Read and write)
- **Expiration:** Set as needed (recommend 1 year max)

## 5. Cloudflare Access Setup

Protect the `/guru/*` path so only authorized users can access the admin panel:

1. Go to **Cloudflare Dashboard > Zero Trust > Access > Applications**
2. Click **Add an application > Self-hosted**
3. Configure:
   - **Application name:** Guru Admin
   - **Application domain:** `montessoriforadolescents.com`
   - **Path:** `/guru/`
4. Add a policy:
   - **Policy name:** Admin Access
   - **Action:** Allow
   - **Include:** Emails - add authorized admin email(s)
5. Save

## 6. Resend Domain Setup

1. Log in to https://resend.com
2. Go to **Domains > Add Domain**
3. Add `montessoriforadolescents.com`
4. Add the required DNS records:
   - **SPF:** TXT record on your domain
   - **DKIM:** CNAME records (Resend provides these)
   - **DMARC:** TXT record (recommended: `v=DMARC1; p=none;`)
5. Wait for verification (usually a few minutes)

### Configure the from address

The site sends emails from: `Montessori for Adolescents <newsletter@montessoriforadolescents.com>`

This works automatically once the domain is verified in Resend.

### (Optional) Webhook for bounce/complaint handling

1. In Resend, go to **Webhooks > Add Webhook**
2. URL: `https://montessoriforadolescents.com/api/resend-webhook`
3. Events: `email.bounced`, `email.complained`
4. Save

## 7. DNS Migration (from GitHub Pages to Cloudflare Pages)

### If using Cloudflare for DNS:

1. Remove the CNAME record pointing to GitHub Pages
2. Cloudflare Pages automatically adds the custom domain when you configure it

### If using external DNS:

1. Update the CNAME record:
   - From: `your-github-username.github.io`
   - To: `your-project.pages.dev`

### Clean up

1. Delete `public/CNAME` (no longer needed with Cloudflare Pages)
2. Disable or remove `.github/workflows/deploy.yml` (Cloudflare Pages handles deployment via GitHub integration)

## 8. Local Development

### Run locally with Wrangler

```bash
# Install dependencies
npm install

# Start local dev with Cloudflare bindings (local D1 + R2)
npx wrangler pages dev -- npm run dev
```

This runs Astro's dev server proxied through Wrangler, giving you local D1 and R2 bindings.

### Initialize local D1

```bash
npx wrangler d1 execute montessori-db --file=schema/init.sql --local
```

### Access the admin panel

Visit `http://localhost:8788/guru/` in your browser. In local dev, auth is fail-open (no Cloudflare Access), so the admin panel is accessible without login.

## 9. Verify Everything Works

### Checklist

- [ ] Site loads at `https://montessoriforadolescents.com`
- [ ] Admin panel accessible at `/guru/` (behind Cloudflare Access)
- [ ] Dashboard shows stats (subscribers, drafts, etc.)
- [ ] Can create and save blog drafts
- [ ] Can publish a draft (commits to GitHub, triggers rebuild)
- [ ] Blog comments form appears on blog post pages
- [ ] Comment submission works (check `/guru/#comments` for moderation)
- [ ] Newsletter subscribe form in footer works
- [ ] Welcome email sent on subscribe (check Resend logs)
- [ ] Can compose and send a test newsletter
- [ ] Can send newsletter to all subscribers
- [ ] Unsubscribe link in emails works
- [ ] Notes tab saves and loads correctly
- [ ] Image upload works in blog editor and newsletter

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_TOKEN` | Yes | Random string for admin API authentication |
| `GITHUB_TOKEN` | Yes | GitHub PAT with Contents write permission |
| `GITHUB_OWNER` | Yes | GitHub org/username owning the repo |
| `GITHUB_REPO` | Yes | Repository name |
| `RESEND_API_KEY` | Yes | Resend API key for email sending |
| `UNSUBSCRIBE_SECRET` | Yes | HMAC secret for secure unsubscribe links |
| `ADMIN_EMAIL` | Yes | Email for admin notifications |
| `CDN_URL` | No | Public URL for R2 bucket (for image uploads) |
| `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile for comment anti-spam |
| `R2_ACCESS_KEY_ID` | No | R2 S3-compatible access key (for presigned URLs) |
| `R2_SECRET_ACCESS_KEY` | No | R2 S3-compatible secret key |
| `R2_ENDPOINT` | No | R2 S3-compatible endpoint URL |
| `R2_BUCKET_NAME` | No | R2 bucket name (defaults to `montessori-media`) |

## Architecture

```
functions/              Cloudflare Pages Functions (serverless API)
  _middleware.js         CORS headers
  lib/auth.js            Admin authentication
  api/
    admin-session.js     Auth session endpoint
    blog-drafts.js       Draft CRUD
    blog-publish.js      Publish to GitHub
    blog-posts.js        List published posts
    blog-comments.js     Comment system
    subscribe.js         Public subscriber signup
    subscribers.js       Admin subscriber management
    subscriber-count.js  Subscriber count
    unsubscribe.js       Unsubscribe flow
    newsletter-send.js   Send newsletters via Resend
    newsletter-campaigns.js  Campaign history
    newsletter-templates.js  Email templates
    resend-webhook.js    Bounce/complaint handling
    settings.js          Notes and settings storage
    file-presign.js      R2 presigned upload URLs
    file-confirm.js      Confirm uploaded files
    image-upload.js      Direct image upload
public/guru/            Admin panel (SPA)
  index.html             Dashboard shell
  css/guru.css           Admin styles
  js/guru-*.js           Admin JavaScript modules
schema/init.sql         D1 database schema
wrangler.jsonc          Cloudflare configuration
```
