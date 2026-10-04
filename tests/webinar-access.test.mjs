// The paid recording's gate: the real watch-page function, the "email me
// my link" endpoint, the Stripe webhook and the Stripe sync, run against the
// in-memory database with Stripe and Resend stubbed. No email leaves here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb, applySchema, stubFetch } from "./helpers/d1.mjs";
import { hashToken } from "../functions/lib/community-auth.js";
import { PLAYER_SLOT } from "../functions/lib/webinar-access.js";

import { onRequestGet as watchGet } from "../functions/webinars/[id]/watch.js";
import { onRequestPost as accessPost } from "../functions/api/webinar-access.js";
import { onRequestPost as stripeWebhookPost } from "../functions/api/community/stripe-webhook.js";
import { onRequestPost as paymentsSyncPost } from "../functions/api/payments.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://montessoriforadolescents.com";
const ID = "adolescent-environment-overview";
const WATCH = `/webinars/${ID}/watch/`;
const EMBED = "https://www.youtube.com/embed/TEST-PLAYER-ID";
const RESEND = "https://api.resend.com/emails";

// What Astro builds for the watch page, reduced to what matters here.
const FRAME = `<html><body><h2>Your Recording</h2>${PLAYER_SLOT}</body></html>`;

function recordingEnv(extra = {}) {
  const env = { SITE_DB: createDb(), STRIPE_SECRET_KEY: "sk_test_x", RESEND_API_KEY: "re_test", ...extra };
  env.SITE_DB.raw
    .prepare(
      `INSERT INTO webinar_recordings (webinar_id, title, embed_url, stripe_product_ids, updated_at)
       VALUES (?, 'An Overview of the Montessori Adolescent Environment and Q&A Session', ?, 'prod_recording', '2026-10-04')`
    )
    .run(ID, EMBED);
  return env;
}

// A Pages context. `sent` settles whatever the handler handed to waitUntil,
// which is where the emails go.
function ctx(env, request, extra = {}) {
  const pending = [];
  return {
    context: { env, request, waitUntil: (p) => pending.push(p), ...extra },
    sent: () => Promise.all(pending),
  };
}

async function watch(env, pathAndQuery = WATCH, cookie = "") {
  let frameServed = false;
  const { context } = ctx(
    env,
    new Request(SITE + pathAndQuery, { headers: cookie ? { Cookie: cookie } : {} }),
    {
      params: { id: ID },
      next: async () => {
        frameServed = true;
        return new Response(FRAME, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      },
    }
  );
  const res = await watchGet(context);
  return { res, body: await res.text(), frameServed };
}

async function askForLink(env, email) {
  const { context, sent } = ctx(
    env,
    new Request(`${SITE}/api/webinar-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webinar: ID, email }),
    })
  );
  const res = await accessPost(context);
  await sent();
  return { status: res.status, json: await res.json() };
}

const cookieFrom = (res) => (res.headers.get("Set-Cookie") || "").split(";")[0];
const emails = (calls) => calls.filter((c) => c.url === RESEND).map((c) => JSON.parse(c.init.body));
const linkIn = (email) => email.html.match(/href="https:\/\/montessoriforadolescents\.com(\/webinars\/[^"]+\?key=[^"]+)"/)[1];
const grants = (env) => env.SITE_DB.raw.prepare("SELECT email, source FROM webinar_access ORDER BY email").all();

function assertSentToSalesPage(result, why) {
  assert.equal(result.res.status, 302);
  assert.equal(result.res.headers.get("Location"), `/webinars/${ID}/?access=${why}#access`);
  assert.equal(result.res.headers.get("Set-Cookie"), null);
  assert.equal(result.body.includes("youtube"), false);
  assert.equal(result.frameServed, false);
}

function stripeSession(over = {}) {
  return {
    id: "cs_test_paid",
    status: "complete",
    payment_status: "paid",
    payment_intent: "pi_1",
    amount_total: 4500,
    currency: "usd",
    created: 1790000000,
    customer_details: { email: "Buyer@Example.com", name: "Alex Buyer" },
    line_items: { data: [{ description: "Recording: Overview of the Montessori Adolescent Environment", price: { product: "prod_recording" } }] },
    ...over,
  };
}

// ---- the watch page ----------------------------------------------------

test("watch: with no proof of purchase the visitor gets the sales page, not the video", async (t) => {
  const env = recordingEnv();
  const calls = stubFetch(t, () => undefined);
  assertSentToSalesPage(await watch(env), "needed");
  assertSentToSalesPage(await watch(env, WATCH, "mfa_recording=made-up-token"), "needed");
  assert.equal(calls.length, 0, "Stripe is not asked about a visitor who claims nothing");
});

test("watch: a paid Stripe session for this recording lets the buyer in, and stays in", async (t) => {
  const env = recordingEnv();
  const calls = stubFetch(t, (url) =>
    url === "https://api.stripe.com/v1/checkout/sessions/cs_test_paid?expand[]=line_items" ? { json: stripeSession() } : undefined
  );

  // Stripe sends the buyer back with the session id in the address.
  const arrival = await watch(env, `${WATCH}?session_id=cs_test_paid`);
  assert.equal(arrival.res.status, 302);
  assert.equal(arrival.res.headers.get("Location"), WATCH, "the session id does not stay in the address");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test_x");
  const setCookie = arrival.res.headers.get("Set-Cookie");
  assert.match(setCookie, /^mfa_recording=[\w-]+; Path=\/webinars\/adolescent-environment-overview\/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000$/);
  assert.equal(arrival.body.includes("youtube"), false);

  // The cookie alone now opens the page; Stripe is not asked again.
  const page = await watch(env, WATCH, cookieFrom(arrival.res));
  assert.equal(page.res.status, 200);
  assert.equal(page.body.includes(`<iframe\n          src="${EMBED}"`), true);
  assert.equal(page.body.includes(PLAYER_SLOT), false);
  assert.match(page.body, /title="An Overview of the Montessori Adolescent Environment and Q&amp;A Session"/);
  assert.equal(page.res.headers.get("Cache-Control"), "private, no-store");
  assert.equal(calls.length, 1);

  assert.deepEqual(grants(env).map((g) => ({ ...g })), [{ email: "buyer@example.com", source: "checkout" }]);
  const stored = env.SITE_DB.raw.prepare("SELECT token_hash FROM webinar_access_tokens").get();
  assert.equal(stored.token_hash, await hashToken(cookieFrom(arrival.res).split("=")[1]), "only the token's hash is kept");
});

test("watch: a paid session for a different product does not open the recording", async (t) => {
  const env = recordingEnv();
  stubFetch(t, () => ({
    json: stripeSession({ line_items: { data: [{ description: "Montessori for Adolescents 101", price: { product: "prod_guide" } }] } }),
  }));
  assertSentToSalesPage(await watch(env, `${WATCH}?session_id=cs_test_paid`), "unconfirmed");
  assert.deepEqual(grants(env), []);
});

test("watch: an unpaid session, one Stripe does not know, or a made-up id opens nothing", async (t) => {
  const env = recordingEnv();
  const calls = stubFetch(t, (url) => {
    if (url.includes("cs_test_unpaid")) return { json: stripeSession({ status: "open", payment_status: "unpaid" }) };
    if (url.includes("cs_test_unknown")) return { status: 404, json: { error: { message: "No such checkout.session" } } };
  });
  assertSentToSalesPage(await watch(env, `${WATCH}?session_id=cs_test_unpaid`), "unconfirmed");
  assertSentToSalesPage(await watch(env, `${WATCH}?session_id=cs_test_unknown`), "unconfirmed");
  assertSentToSalesPage(await watch(env, `${WATCH}?session_id=../../v1/customers`), "unconfirmed");
  assert.equal(calls.length, 2, "an id that is not a session id never reaches Stripe");
  assert.deepEqual(grants(env), []);
});

test("watch: a Collective member who has not bought the recording is not let in", async (t) => {
  const env = recordingEnv();
  stubFetch(t, () => undefined);
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 30 * 86400000).toISOString();
  env.SITE_DB.raw
    .prepare("INSERT INTO community_members (id, email, name, role, status, joined_at) VALUES ('mem_1','nik@example.com','Nik Farah','member','active',?)")
    .run(now);
  env.SITE_DB.raw
    .prepare("INSERT INTO community_sessions (token_hash, member_id, created_at, expires_at) VALUES (?,?,?,?)")
    .run(await hashToken("session-token"), "mem_1", now, later);
  assertSentToSalesPage(await watch(env, WATCH, "apc_session=session-token"), "needed");
});

test("watch: a recording still being prepared says so to its buyers", async (t) => {
  const env = recordingEnv();
  env.SITE_DB.raw.prepare("UPDATE webinar_recordings SET embed_url = ''").run();
  stubFetch(t, () => ({ json: stripeSession() }));
  const arrival = await watch(env, `${WATCH}?session_id=cs_test_paid`);
  const page = await watch(env, WATCH, cookieFrom(arrival.res));
  assert.equal(page.res.status, 200);
  assert.match(page.body, /being prepared/);
  assert.equal(page.body.includes("<iframe"), false);
});

// ---- the way back in, by email ---------------------------------------

// Production as it stood when the gate went in: buyers exist only as rows
// in the payments mirror. Re-running the schema file is the migration.
function envWithPastBuyer() {
  const env = recordingEnv();
  const pay = env.SITE_DB.raw.prepare(
    "INSERT INTO payments (id, email, name, amount, description, kind, source, created_at) VALUES (?,?,?,?,?,?,?,?)"
  );
  pay.run("pi_old", "past@example.com", "Past Buyer", 4500, "Recording: Overview of the Montessori Adolescent Environment", "webinar", "checkout", "2026-08-20T03:00:00.000Z");
  pay.run("pi_gift", "donor@example.com", "A Donor", 2000, "Donation", "donation", "checkout", "2026-08-21T03:00:00.000Z");
  pay.run("pi_next", "next@example.com", "Next Webinar", 6500, "Erdkinder in Practice webinar", "webinar", "checkout", "2026-12-01T03:00:00.000Z");
  applySchema(env.SITE_DB.raw, "webinar-recordings.sql");
  return env;
}

test("returning buyer: someone who paid before the gate asks by email and gets back in", async (t) => {
  const env = envWithPastBuyer();
  assert.deepEqual(grants(env).map((g) => ({ ...g })), [{ email: "past@example.com", source: "backfill" }]);

  const calls = stubFetch(t, (url) => (url === RESEND ? { json: { id: "sent_1" } } : undefined));
  const asked = await askForLink(env, " Past@Example.com ");
  assert.equal(asked.status, 200);

  const [email] = emails(calls);
  assert.equal(emails(calls).length, 1);
  assert.deepEqual(email.to, ["past@example.com"]);
  assert.equal(email.from, "Montessori for Adolescents <newsletter@montessoriforadolescents.com>");
  assert.match(email.html, /Q&amp;A Session/);

  // The emailed link becomes a cookie, and the cookie shows the recording.
  const arrival = await watch(env, linkIn(email));
  assert.equal(arrival.res.status, 302);
  assert.equal(arrival.res.headers.get("Location"), WATCH);
  const page = await watch(env, WATCH, cookieFrom(arrival.res));
  assert.equal(page.body.includes(EMBED), true);

  // A mail scanner may have opened the link first: it still works for them.
  assert.equal((await watch(env, linkIn(email))).res.headers.get("Location"), WATCH);
});

test("returning buyer: an address with no purchase gets the same reply and no email", async (t) => {
  const env = envWithPastBuyer();
  const calls = stubFetch(t, () => ({ json: { id: "sent" } }));
  const buyer = await askForLink(env, "past@example.com");
  const stranger = await askForLink(env, "stranger@example.com");
  const donor = await askForLink(env, "donor@example.com");
  const nextWebinar = await askForLink(env, "next@example.com");
  assert.deepEqual(stranger, buyer);
  assert.deepEqual(donor, buyer);
  assert.deepEqual(nextWebinar, buyer);
  assert.deepEqual(emails(calls).map((e) => e.to[0]), ["past@example.com"]);

  assert.equal((await askForLink(env, "not-an-email")).status, 400);
});

test("returning buyer: the form cannot be used to flood a buyer's inbox", async (t) => {
  const env = envWithPastBuyer();
  const calls = stubFetch(t, () => ({ json: { id: "sent" } }));
  for (let i = 0; i < 5; i++) assert.equal((await askForLink(env, "past@example.com")).status, 200);
  assert.equal(emails(calls).length, 3);
});

test("returning buyer: a lapsed link, or access since removed, sends them to ask again", async (t) => {
  const env = envWithPastBuyer();
  const calls = stubFetch(t, () => ({ json: { id: "sent" } }));
  await askForLink(env, "past@example.com");
  const link = linkIn(emails(calls)[0]);
  const session = cookieFrom((await watch(env, link)).res);

  env.SITE_DB.raw.prepare("UPDATE webinar_access_tokens SET expires_at = '2026-01-01T00:00:00.000Z' WHERE kind = 'link'").run();
  assertSentToSalesPage(await watch(env, link), "expired");
  assert.equal((await watch(env, WATCH, session)).res.status, 200, "the browser already let in stays in");
  const oldLinkSameBrowser = await watch(env, link, session);
  assert.equal(oldLinkSameBrowser.res.headers.get("Location"), WATCH, "and an old link opened there just goes to the recording");

  // A refund: delete the row, and neither the browser nor a new request works.
  env.SITE_DB.raw.prepare("DELETE FROM webinar_access WHERE email = 'past@example.com'").run();
  assertSentToSalesPage(await watch(env, WATCH, session), "needed");
  await askForLink(env, "past@example.com");
  assert.equal(emails(calls).length, 1);
});

// ---- purchases arriving from Stripe -----------------------------------

async function stripeWebhook(env, event) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex");
  const { context, sent } = ctx(
    env,
    new Request(`${SITE}/api/community/stripe-webhook`, {
      method: "POST",
      headers: { "Stripe-Signature": `t=${timestamp},v1=${v1}`, "Content-Type": "application/json" },
      body,
    })
  );
  const res = await stripeWebhookPost(context);
  await sent();
  return res;
}

test("webhook: buying the recording grants access and emails the link once, however often Stripe retries", async (t) => {
  const env = recordingEnv({ STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_COLLECTIVE_PRODUCT_ID: "prod_collective" });
  const { line_items, ...session } = stripeSession({ id: "cs_live_1" });
  const calls = stubFetch(t, (url) => {
    if (url === "https://api.stripe.com/v1/checkout/sessions/cs_live_1/line_items?limit=100") return { json: line_items };
    if (url === RESEND) return { json: { id: "sent" } };
  });
  const event = { type: "checkout.session.completed", data: { object: session } };

  assert.equal((await stripeWebhook(env, event)).status, 200);
  assert.equal((await stripeWebhook(env, event)).status, 200);

  assert.deepEqual(grants(env).map((g) => ({ ...g })), [{ email: "buyer@example.com", source: "checkout" }]);
  assert.equal(emails(calls).length, 1);
  assert.deepEqual(emails(calls)[0].to, ["buyer@example.com"]);
  assert.equal(env.SITE_DB.raw.prepare("SELECT COUNT(*) n FROM community_members").get().n, 0, "a recording is not a membership");

  const arrival = await watch(env, linkIn(emails(calls)[0]));
  const page = await watch(env, WATCH, cookieFrom(arrival.res));
  assert.equal(page.body.includes(EMBED), true);
});

test("webhook: a purchase of something else grants no recording", async (t) => {
  const env = recordingEnv({ STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_COLLECTIVE_PRODUCT_ID: "prod_collective" });
  const { line_items, ...session } = stripeSession({ id: "cs_live_2" });
  const calls = stubFetch(t, (url) =>
    url.includes("/line_items") ? { json: { data: [{ description: "Donation", price: { product: "prod_donation" } }] } } : undefined
  );
  assert.equal((await stripeWebhook(env, { type: "checkout.session.completed", data: { object: session } })).status, 200);
  assert.deepEqual(grants(env), []);
  assert.equal(emails(calls).length, 0);
});

test("sync: a recording sale the webhook missed is caught up, without emailing anyone", async (t) => {
  const env = recordingEnv({ ADMIN_TOKEN: "admin" });
  const calls = stubFetch(t, (url) => {
    if (url.startsWith("https://api.stripe.com/v1/checkout/sessions?")) return { json: { data: [stripeSession()], has_more: false } };
    if (url.startsWith("https://api.stripe.com/v1/invoices?")) return { json: { data: [], has_more: false } };
  });
  const { context, sent } = ctx(env, new Request(`${SITE}/api/payments`, { method: "POST", headers: { "X-Admin-Token": "admin" } }));
  const json = await (await paymentsSyncPost(context)).json();
  await sent();
  assert.deepEqual(json, { ok: true, imported: 1, errors: [] });
  assert.deepEqual(grants(env).map((g) => ({ ...g })), [{ email: "buyer@example.com", source: "sync" }]);
  assert.equal(emails(calls).length, 0);
});

// ---- what the public repo and the static build may contain --------------

test("repo: no player address in the content or the watch page, and the frame has the slot", () => {
  const read = (...parts) => readFileSync(path.join(ROOT, ...parts), "utf8");
  const playerAddress = /recordingEmbedUrl|youtube\.com|youtu\.be|vimeo\.com/i;

  const dir = path.join(ROOT, "src/content/webinars");
  for (const file of readdirSync(dir)) {
    assert.equal(playerAddress.test(read("src/content/webinars", file)), false, `${file} carries a player address`);
  }

  const frame = read("src/pages/webinars/[id]/watch.astro");
  assert.equal(playerAddress.test(frame), false);
  assert.equal(frame.includes(PLAYER_SLOT), true, "the function has nowhere to put the player");
});
