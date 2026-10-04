import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./helpers/d1.mjs";
import {
  WEBHOOK_ENDPOINT,
  WEBHOOK_EVENTS,
  listResendWebhooks,
  reconnectResendWebhook,
  readWebhookConfig,
  readWebhookHealth,
  recordWebhookRejected,
  recordWebhookReceived,
  signingSecrets,
  describeWebhookState,
} from "../functions/lib/resend-webhooks.js";

// A pretend Resend: holds a list of webhooks and answers the three calls.
function fakeResend(initial = []) {
  const hooks = initial.map((h) => ({ status: "enabled", events: ["email.sent"], ...h }));
  const calls = [];
  const fetchImpl = async (url, init) => {
    const { pathname } = new URL(url);
    calls.push(`${init.method} ${pathname}`);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (init.headers.Authorization !== "Bearer re_test") return json({ message: "API key is invalid" }, 401);
    if (init.method === "GET" && pathname === "/webhooks") {
      return json({ object: "list", data: hooks.map(({ signing_secret, ...rest }) => rest) });
    }
    if (init.method === "GET" && pathname.startsWith("/webhooks/")) {
      const hook = hooks.find((h) => h.id === pathname.split("/")[2]);
      return hook ? json({ object: "webhook", ...hook }) : json({ message: "not found" }, 404);
    }
    if (init.method === "POST" && pathname === "/webhooks") {
      const body = JSON.parse(init.body);
      const hook = { id: "wh_new", signing_secret: "whsec_bmV3", status: "enabled", ...body };
      hooks.push(hook);
      return json({ object: "webhook", id: hook.id, signing_secret: hook.signing_secret });
    }
    return json({ message: "unexpected" }, 500);
  };
  return { fetchImpl, calls, hooks };
}

const envWith = (extra = {}) => ({ SITE_DB: createDb(), RESEND_API_KEY: "re_test", ...extra });

test("nothing registered: Reconnect creates the webhook and keeps its secret", async () => {
  const env = envWith();
  const resend = fakeResend();
  const result = await reconnectResendWebhook(env, resend.fetchImpl);

  assert.equal(result.action, "created");
  assert.deepEqual(resend.calls, ["GET /webhooks", "POST /webhooks"]);
  assert.equal(resend.hooks[0].endpoint, WEBHOOK_ENDPOINT);
  assert.deepEqual(resend.hooks[0].events, WEBHOOK_EVENTS);
  assert.equal(JSON.stringify(result).includes("whsec_"), false, "the summary never carries the secret");

  const config = await readWebhookConfig(env);
  assert.equal(config.signingSecret, "whsec_bmV3");
  assert.equal(config.webhookId, "wh_new");
  assert.deepEqual(await signingSecrets(env), ["whsec_bmV3"]);
});

test("already registered: Reconnect adopts the existing secret and creates nothing", async () => {
  const env = envWith({ RESEND_WEBHOOK_SECRET: "whsec_b2xk" });
  const resend = fakeResend([{ id: "wh_1", endpoint: WEBHOOK_ENDPOINT, signing_secret: "whsec_cmVhbA==" }]);
  const result = await reconnectResendWebhook(env, resend.fetchImpl);

  assert.equal(result.action, "adopted");
  assert.deepEqual(resend.calls, ["GET /webhooks", "GET /webhooks/wh_1"]);
  assert.equal(resend.hooks.length, 1);
  // Both the adopted secret and the hand-set one are honoured.
  assert.deepEqual(await signingSecrets(env), ["whsec_cmVhbA==", "whsec_b2xk"]);
  // It was only subscribed to email.sent; say what is missing.
  assert.ok(result.missingEvents.includes("email.delivered"));
});

test("a webhook on the www host is not ours: a correct one is added and the stray is reported", async () => {
  const env = envWith();
  const stray = "https://www.montessoriforadolescents.com/api/resend-webhook";
  const resend = fakeResend([{ id: "wh_www", endpoint: stray, signing_secret: "whsec_d3d3" }]);
  const result = await reconnectResendWebhook(env, resend.fetchImpl);

  assert.equal(result.action, "created");
  assert.deepEqual(result.others, [{ id: "wh_www", endpoint: stray, status: "enabled" }]);
});

test("a trailing slash or different case is still ours", async () => {
  const env = envWith();
  const resend = fakeResend([{ id: "wh_1", endpoint: WEBHOOK_ENDPOINT.toUpperCase().replace("HTTPS", "https") + "/", signing_secret: "whsec_eA==" }]);
  const hooks = await listResendWebhooks(env, resend.fetchImpl);
  assert.equal(hooks[0].isOurs, true);
});

test("a key that may not manage webhooks surfaces Resend's own answer", async () => {
  const env = { SITE_DB: createDb(), RESEND_API_KEY: "re_wrong" };
  await assert.rejects(
    reconnectResendWebhook(env, fakeResend().fetchImpl),
    (err) => err.status === 401 && /API key is invalid/.test(err.message)
  );
  assert.deepEqual(await readWebhookConfig(env), {}, "nothing is stored on failure");
});

test("no API key at all is refused before any call", async () => {
  await assert.rejects(reconnectResendWebhook({ SITE_DB: createDb() }, fakeResend().fetchImpl), /No Resend API key/);
});

test("refusals are noted at most once a minute; Reconnect clears the marker", async () => {
  const env = envWith();
  await recordWebhookRejected(env, "signature");
  await recordWebhookRejected(env, "signature");
  let health = await readWebhookHealth(env);
  assert.equal(health.rejectedCount, 1);
  assert.ok(health.lastRejectedAt);

  await reconnectResendWebhook(env, fakeResend().fetchImpl);
  health = await readWebhookHealth(env);
  assert.equal(health.lastRejectedAt, undefined);
  assert.equal(health.rejectedCount, 1, "the count is history and stays");
});

test("received events are counted and named", async () => {
  const env = envWith();
  await recordWebhookReceived(env, "delivered");
  await recordWebhookReceived(env, "clicked");
  const health = await readWebhookHealth(env);
  assert.equal(health.receivedCount, 2);
  assert.equal(health.lastEventType, "clicked");
});

test("the verdict names the actual fault", () => {
  const ours = { id: "w", endpoint: WEBHOOK_ENDPOINT, status: "enabled", isOurs: true };
  const t = (x) => describeWebhookState(x).verdict;

  assert.equal(t({ webhooks: [] }), "not-registered");
  assert.equal(t({ webhooks: [{ ...ours, isOurs: false }] }), "not-registered");
  assert.equal(t({ webhooks: [{ ...ours, status: "disabled" }] }), "disabled");
  assert.equal(t({ webhooks: [ours], hasEnvSecret: true, health: { lastRejectedAt: "2026-10-04T08:00:00Z" } }), "rejecting");
  assert.equal(
    t({ webhooks: [ours], health: { lastRejectedAt: "2026-10-04T08:00:00Z", lastReceivedAt: "2026-10-04T09:00:00Z" } }),
    "live"
  );
  assert.equal(t({ webhooks: [ours], hasEnvSecret: true }), "waiting");
  assert.equal(t({ webhooks: [ours] }), "no-secret");
  // Resend unreachable: fall back on what we have seen ourselves, and
  // never claim a connection nobody has confirmed.
  assert.equal(t({ webhooks: null, health: { lastReceivedAt: "2026-10-04T09:00:00Z" } }), "live");
  assert.equal(t({ webhooks: null, hasEnvSecret: true }), "unknown");
});
