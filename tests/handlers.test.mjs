// The real request handlers, run against the in-memory database with
// Resend's API stubbed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb, stubFetch } from "./helpers/d1.mjs";
import { signSvixPayload } from "../functions/lib/svix.js";
import { hashToken } from "../functions/lib/community-auth.js";
import { readWebhookHealth, WEBHOOK_ENDPOINT } from "../functions/lib/resend-webhooks.js";

import { onRequestPost as webhookPost } from "../functions/api/resend-webhook.js";
import { onRequestGet as statsGet } from "../functions/api/campaign-stats.js";
import { onRequestGet as statusGet, onRequestPost as statusPost } from "../functions/api/resend-webhook-status.js";
import { onRequestPost as rsvpPost } from "../functions/api/community/rsvp.js";
import { onRequestGet as eventsGet } from "../functions/api/community/events.js";
import { onRequestGet as icsGet } from "../functions/api/community/event-ics.js";

const SITE = "https://montessoriforadolescents.com";
const secretA = "whsec_" + Buffer.from("secret-set-by-hand-as-pages-var!").toString("base64");
const secretB = "whsec_" + Buffer.from("secret-adopted-from-resend-api!!").toString("base64");

async function signedWebhook(env, payload, secret, { headers = true } = {}) {
  const body = JSON.stringify(payload);
  const id = "msg_" + Math.random().toString(36).slice(2);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const h = { "Content-Type": "application/json" };
  if (headers) {
    h["svix-id"] = id;
    h["svix-timestamp"] = timestamp;
    h["svix-signature"] = await signSvixPayload({ id, timestamp, body, secret });
  }
  const request = new Request(`${SITE}/api/resend-webhook`, { method: "POST", headers: h, body });
  return webhookPost({ env, request });
}

const row = (db, sql, ...args) => db.raw.prepare(sql).get(...args);

// ---- the webhook --------------------------------------------------

test("webhook: a signed event is stored, and tracking is marked alive", async () => {
  const env = { SITE_DB: createDb(), RESEND_WEBHOOK_SECRET: secretA };
  const res = await signedWebhook(
    env,
    { type: "email.delivered", created_at: "2026-10-04T08:00:00Z", data: { email_id: "e1", to: ["Alex@Example.com"] } },
    secretA
  );
  assert.equal(res.status, 200);

  const stored = row(env.SITE_DB, "SELECT * FROM resend_events WHERE emailId = 'e1'");
  assert.equal(stored.last_event, "delivered");
  assert.equal(stored.email, "alex@example.com");
  assert.equal(JSON.parse(stored.events).length, 1);

  const health = await readWebhookHealth(env);
  assert.equal(health.receivedCount, 1);
  assert.equal(health.lastEventType, "delivered");
});

test("webhook: a later, stronger event upgrades the row; a weaker one does not downgrade it", async () => {
  const env = { SITE_DB: createDb(), RESEND_WEBHOOK_SECRET: secretA };
  const send = (type) => signedWebhook(env, { type, data: { email_id: "e1", to: ["a@example.com"] } }, secretA);
  await send("email.sent");
  await send("email.delivered");
  await send("email.clicked");
  await send("email.opened");
  const stored = row(env.SITE_DB, "SELECT * FROM resend_events WHERE emailId = 'e1'");
  assert.equal(stored.last_event, "clicked");
  assert.equal(JSON.parse(stored.events).length, 4);
});

test("webhook: the wrong secret is refused and noted as a refusal", async () => {
  const env = { SITE_DB: createDb(), RESEND_WEBHOOK_SECRET: secretA };
  const res = await signedWebhook(env, { type: "email.delivered", data: { email_id: "e1", to: ["a@example.com"] } }, secretB);
  assert.equal(res.status, 401);
  assert.equal(row(env.SITE_DB, "SELECT COUNT(*) n FROM resend_events").n, 0);
  const health = await readWebhookHealth(env);
  assert.equal(health.rejectedCount, 1);
  assert.equal(health.receivedCount, undefined);
});

test("webhook: an unsigned stray request is refused and leaves no trace", async () => {
  const env = { SITE_DB: createDb(), RESEND_WEBHOOK_SECRET: secretA };
  const res = await signedWebhook(env, { type: "email.bounced", data: { email_id: "e1", to: ["a@example.com"] } }, secretA, { headers: false });
  assert.equal(res.status, 401);
  assert.deepEqual(await readWebhookHealth(env), {});
});

test("webhook: a secret adopted by Reconnect is honoured alongside a stale hand-set one", async (t) => {
  const env = { SITE_DB: createDb(), RESEND_WEBHOOK_SECRET: secretA, RESEND_API_KEY: "re_test", ADMIN_TOKEN: "admin" };

  // Before the repair, Resend's real secret (B) fails against the stale one (A).
  const event = { type: "email.delivered", data: { email_id: "e9", to: ["a@example.com"] } };
  assert.equal((await signedWebhook(env, event, secretB)).status, 401);

  // Reconnect through the endpoint, with Resend stubbed to hold secret B.
  await t.test("reconnect", async (st) => {
    stubFetch(st, (url, init) => {
      const { pathname } = new URL(url);
      if (init.method === "GET" && pathname === "/webhooks") {
        return { json: { data: [{ id: "wh_1", endpoint: WEBHOOK_ENDPOINT, status: "enabled", events: ["email.delivered"] }] } };
      }
      if (init.method === "GET" && pathname === "/webhooks/wh_1") {
        return { json: { id: "wh_1", endpoint: WEBHOOK_ENDPOINT, status: "enabled", events: ["email.delivered"], signing_secret: secretB } };
      }
    });
    const request = new Request(`${SITE}/api/resend-webhook-status`, {
      method: "POST",
      headers: { "X-Admin-Token": "admin", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reconnect" }),
    });
    const res = await statusPost({ env, request });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.result.action, "adopted");
    assert.equal(JSON.stringify(json).includes("whsec_"), false, "no secret in the response");
    assert.equal(json.status.verdict, "waiting");
  });

  // After it, the same event is accepted.
  assert.equal((await signedWebhook(env, event, secretB)).status, 200);
  assert.equal(row(env.SITE_DB, "SELECT last_event FROM resend_events WHERE emailId = 'e9'").last_event, "delivered");
});

test("webhook: a bounce unsubscribes the address", async () => {
  const env = { SITE_DB: createDb(), RESEND_WEBHOOK_SECRET: secretA };
  env.SITE_DB.raw
    .prepare("INSERT INTO subscribers (email, firstName, subscribedAt, unsubscribed) VALUES ('gone@example.com','G','2026-01-01',0)")
    .run();
  await signedWebhook(env, { type: "email.bounced", data: { email_id: "e2", to: ["gone@example.com"] } }, secretA);
  assert.equal(row(env.SITE_DB, "SELECT unsubscribed FROM subscribers WHERE email='gone@example.com'").unsubscribed, 1);
});

// ---- the status endpoint ---------------------------------------------

test("status: refuses without the admin token, and when none is configured", async () => {
  const request = new Request(`${SITE}/api/resend-webhook-status`);
  assert.equal((await statusGet({ env: { SITE_DB: createDb(), ADMIN_TOKEN: "admin" }, request })).status, 401);
  assert.equal((await statusGet({ env: { SITE_DB: createDb() }, request })).status, 503);
});

test("status: with nothing registered at Resend it says so", async (t) => {
  const env = { SITE_DB: createDb(), ADMIN_TOKEN: "admin", RESEND_API_KEY: "re_test", RESEND_WEBHOOK_SECRET: secretA };
  stubFetch(t, () => ({ json: { data: [] } }));
  const request = new Request(`${SITE}/api/resend-webhook-status`, { headers: { "X-Admin-Token": "admin" } });
  const json = await (await statusGet({ env, request })).json();
  assert.equal(json.verdict, "not-registered");
  assert.equal(json.endpoint, WEBHOOK_ENDPOINT);
  assert.equal(json.secret.setByHand, true);
  assert.equal(JSON.stringify(json).includes("whsec_"), false);
});

test("status: a sending-only key gets instructions, not a stack trace", async (t) => {
  const env = { SITE_DB: createDb(), ADMIN_TOKEN: "admin", RESEND_API_KEY: "re_sendonly" };
  stubFetch(t, () => ({ status: 401, json: { message: "This API key is restricted to only send emails" } }));
  const request = new Request(`${SITE}/api/resend-webhook-status`, {
    method: "POST",
    headers: { "X-Admin-Token": "admin", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reconnect" }),
  });
  const res = await statusPost({ env, request });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /not allowed to manage webhooks/);
});

// ---- campaign stats ----------------------------------------------------

function seedCampaign(db, { sentAt, ids }) {
  db.raw
    .prepare("INSERT INTO campaigns (id, subject, sentAt, totalSent, totalRecipients, emailIds) VALUES ('c1','Hello',?,?,?,?)")
    .run(sentAt, ids.length, ids.length, JSON.stringify(ids));
}
const seedEvent = (db, id, email, last, events, updated) =>
  db.raw.prepare("INSERT INTO resend_events (emailId, email, last_event, events, updated_at) VALUES (?,?,?,?,?)").run(id, email, last, events, updated);

test("stats: a stale snapshot is asked for again, so a later click shows up", async (t) => {
  const env = { SITE_DB: createDb(), RESEND_API_KEY: "re_test" };
  const days = (n) => new Date(Date.now() - n * 86400000).toISOString();
  seedCampaign(env.SITE_DB, { sentAt: days(3), ids: ["e1", "e2", "e3"] });
  seedEvent(env.SITE_DB, "e1", "alex@example.com", "delivered", "[]", days(3));             // stale snapshot
  seedEvent(env.SITE_DB, "e2", "lola@example.com", "delivered", '[{"type":"delivered"}]', days(3)); // webhook row
  // e3 has never been looked at.

  const calls = stubFetch(t, (url) => {
    if (url.endsWith("/emails/e1")) return { json: { id: "e1", to: ["alex@example.com"], last_event: "clicked" } };
    if (url.endsWith("/emails/e3")) return { json: { id: "e3", to: ["nik@example.com"], last_event: "delivered" } };
  });

  const res = await statsGet({ env, request: new Request(`${SITE}/api/campaign-stats?id=c1`) });
  const json = await res.json();

  assert.deepEqual(calls.map((c) => c.url.split("/").pop()).sort(), ["e1", "e3"], "the webhook row is not re-asked");
  assert.deepEqual(json.stats, { total: 3, delivered: 3, clicked: 1, bounced: 0, complained: 0 });
  const byId = Object.fromEntries(json.eventDetails.map((d) => [d.id, d]));
  assert.equal(byId.e1.last_event, "clicked");
  assert.equal(byId.e1.to, "alex@example.com");
  assert.equal(byId.e2.source, "webhook");
  assert.equal(row(env.SITE_DB, "SELECT last_event FROM resend_events WHERE emailId='e1'").last_event, "clicked");
});

test("stats: a fresh snapshot is trusted; Resend is not asked twice in ten minutes", async (t) => {
  const env = { SITE_DB: createDb(), RESEND_API_KEY: "re_test" };
  seedCampaign(env.SITE_DB, { sentAt: new Date(Date.now() - 3600000).toISOString(), ids: ["e1"] });
  seedEvent(env.SITE_DB, "e1", "a@example.com", "delivered", "[]", new Date().toISOString());
  const calls = stubFetch(t, () => undefined);
  const json = await (await statsGet({ env, request: new Request(`${SITE}/api/campaign-stats?id=c1`) })).json();
  assert.equal(calls.length, 0);
  assert.equal(json.stats.delivered, 1);
});

test("stats: when Resend cannot be asked, the stored value stands", async (t) => {
  const env = { SITE_DB: createDb(), RESEND_API_KEY: "re_test" };
  const days = (n) => new Date(Date.now() - n * 86400000).toISOString();
  seedCampaign(env.SITE_DB, { sentAt: days(2), ids: ["e1"] });
  seedEvent(env.SITE_DB, "e1", "a@example.com", "delivered", "[]", days(2));
  stubFetch(t, () => ({ status: 429, json: {} }));
  const json = await (await statsGet({ env, request: new Request(`${SITE}/api/campaign-stats?id=c1`) })).json();
  assert.equal(json.stats.delivered, 1);
  assert.equal(json.debug.rateLimitHit, true);
});

test("stats: asking Resend never overwrites a row the webhook has filled", async (t) => {
  const env = { SITE_DB: createDb(), RESEND_API_KEY: "re_test" };
  const days = (n) => new Date(Date.now() - n * 86400000).toISOString();
  seedCampaign(env.SITE_DB, { sentAt: days(2), ids: ["e1"] });
  seedEvent(env.SITE_DB, "e1", "a@example.com", "delivered", "[]", days(2));
  stubFetch(t, () => {
    // The webhook lands while we are mid-request.
    env.SITE_DB.raw
      .prepare("UPDATE resend_events SET last_event='complained', events='[{\"type\":\"complained\"}]' WHERE emailId='e1'")
      .run();
    return { json: { id: "e1", to: ["a@example.com"], last_event: "delivered" } };
  });
  await statsGet({ env, request: new Request(`${SITE}/api/campaign-stats?id=c1`) });
  const stored = row(env.SITE_DB, "SELECT last_event, events FROM resend_events WHERE emailId='e1'");
  assert.equal(stored.last_event, "complained");
  assert.notEqual(stored.events, "[]");
});

// ---- calendar invites ---------------------------------------------------

async function memberEnv() {
  const env = { SITE_DB: createDb(), RESEND_API_KEY: "re_test" };
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 30 * 86400000).toISOString();
  env.SITE_DB.raw
    .prepare("INSERT INTO community_members (id, email, name, role, status, joined_at) VALUES ('mem_1','nik@example.com','Nik Farah','member','active',?)")
    .run(now);
  env.SITE_DB.raw
    .prepare("INSERT INTO community_sessions (token_hash, member_id, created_at, expires_at) VALUES (?,?,?,?)")
    .run(await hashToken("session-token"), "mem_1", now, later);
  env.SITE_DB.raw
    .prepare(
      `INSERT INTO community_events (id, kind, title, description, starts_at, ends_at, timezone_note, location, link, status, created_at, updated_at)
       VALUES ('evt_1','gathering','Monthly Meeting','Bring a question.',?, '', '9:00pm Malaysia · 2:00pm France', 'Online', 'https://meet.google.com/abc-defg-hij', 'visible', ?, ?)`
    )
    .run(later, now, now);
  return { env, cookie: "apc_session=session-token", startsAt: later };
}

test("rsvp: the confirmation carries a Google Calendar link and an .ics attachment", async (t) => {
  const { env, cookie } = await memberEnv();
  const calls = stubFetch(t, (url) => (url === "https://api.resend.com/emails" ? { json: { id: "sent_1" } } : undefined));

  const request = new Request(`${SITE}/api/community/rsvp`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: "evt_1" }),
  });
  const res = await rsvpPost({ env, request });
  assert.deepEqual(await res.json(), { ok: true, going: true, rsvp_count: 1 });

  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.to, ["nik@example.com"]);
  assert.match(sent.html, /Join the gathering/);
  assert.match(sent.html, /href="https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.equal(sent.attachments.length, 1);
  assert.match(sent.attachments[0].filename, /^monthly-meeting-\d{4}-\d{2}-\d{2}\.ics$/);
  const ics = Buffer.from(sent.attachments[0].content, "base64").toString("utf8").replace(/\r\n /g, "");
  assert.match(ics, /UID:evt_1@montessoriforadolescents\.com/);
  assert.match(ics, /Join: https:\/\/meet\.google\.com\/abc-defg-hij/);
});

test("rsvp: if Resend refuses the attachment, the confirmation still goes out without it", async (t) => {
  const { env, cookie } = await memberEnv();
  let n = 0;
  const calls = stubFetch(t, () => (++n === 1 ? { status: 422, json: { message: "Invalid attachment" } } : { json: { id: "sent_2" } }));

  const request = new Request(`${SITE}/api/community/rsvp`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: "evt_1" }),
  });
  const res = await rsvpPost({ env, request });
  assert.equal((await res.json()).going, true, "the RSVP itself is unaffected");

  assert.equal(calls.length, 2);
  const [first, second] = calls.map((c) => JSON.parse(c.init.body));
  assert.equal(first.attachments.length, 1);
  assert.equal("attachments" in second, false);
  assert.match(second.html, /calendar\.google\.com/, "the calendar link in the body survives");
});

test("rsvp: pressing the button twice sends one confirmation", async (t) => {
  const { env, cookie } = await memberEnv();
  const calls = stubFetch(t, () => ({ json: { id: "sent" } }));
  const post = () =>
    rsvpPost({
      env,
      request: new Request(`${SITE}/api/community/rsvp`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: "evt_1" }),
      }),
    });
  await post();
  await post();
  assert.equal(calls.length, 1);
});

test("events: each upcoming event comes with its calendar links; a cancelled one does not", async () => {
  const { env, cookie } = await memberEnv();
  env.SITE_DB.raw
    .prepare(
      `INSERT INTO community_events (id, kind, title, starts_at, status, created_at, updated_at)
       VALUES ('evt_2','gathering','Called off', ?, 'cancelled', '2026-01-01', '2026-01-01')`
    )
    .run(new Date(Date.now() + 40 * 86400000).toISOString());

  const res = await eventsGet({ env, request: new Request(`${SITE}/api/community/events?when=upcoming`, { headers: { Cookie: cookie } }) });
  const { events } = await res.json();
  const on = events.find((e) => e.id === "evt_1");
  assert.match(on.calendar.google, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.equal(on.calendar.ics, "/api/community/event-ics?id=evt_1");
  assert.equal(events.find((e) => e.id === "evt_2").calendar, null);
});

test("event-ics: a member downloads a calendar file; a stranger does not", async () => {
  const { env, cookie } = await memberEnv();
  const url = `${SITE}/api/community/event-ics?id=evt_1`;

  const res = await icsGet({ env, request: new Request(url, { headers: { Cookie: cookie } }) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /^text\/calendar/);
  assert.match(res.headers.get("Content-Disposition"), /attachment; filename="monthly-meeting-/);
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  assert.match(await res.text(), /^BEGIN:VCALENDAR\r\n/);

  assert.equal((await icsGet({ env, request: new Request(url) })).status, 401);
  assert.equal(
    (await icsGet({ env, request: new Request(`${SITE}/api/community/event-ics?id=nope`, { headers: { Cookie: cookie } }) })).status,
    404
  );
});
