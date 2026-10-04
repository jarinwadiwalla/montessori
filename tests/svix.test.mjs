import { test } from "node:test";
import assert from "node:assert/strict";
import { verifySvixSignature, signSvixPayload } from "../functions/lib/svix.js";

const secret = "whsec_" + Buffer.from("a-test-signing-secret-32-bytes!!").toString("base64");
const other = "whsec_" + Buffer.from("a-different-secret-entirely-000!").toString("base64");
const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1", to: ["a@example.com"] } });
const now = 1_790_000_000;
const base = { id: "msg_1", timestamp: String(now), body, nowSeconds: now };

test("a correctly signed payload is accepted", async () => {
  const signatureHeader = await signSvixPayload({ ...base, secret });
  assert.equal(await verifySvixSignature({ ...base, signatureHeader, secret }), true);
});

test("a payload signed with another secret is refused", async () => {
  const signatureHeader = await signSvixPayload({ ...base, secret: other });
  assert.equal(await verifySvixSignature({ ...base, signatureHeader, secret }), false);
});

test("a tampered body is refused", async () => {
  const signatureHeader = await signSvixPayload({ ...base, secret });
  assert.equal(
    await verifySvixSignature({ ...base, body: body.replace("delivered", "bounced"), signatureHeader, secret }),
    false
  );
});

test("an old timestamp is refused even with a valid signature", async () => {
  const signatureHeader = await signSvixPayload({ ...base, secret });
  assert.equal(
    await verifySvixSignature({ ...base, signatureHeader, secret, nowSeconds: now + 301 }),
    false
  );
});

test("during rotation, any one valid signature in the header is enough", async () => {
  const good = await signSvixPayload({ ...base, secret });
  const stale = await signSvixPayload({ ...base, secret: other });
  assert.equal(await verifySvixSignature({ ...base, signatureHeader: `${stale} ${good}`, secret }), true);
});

test("missing pieces and malformed secrets are a plain no, never a throw", async () => {
  const signatureHeader = await signSvixPayload({ ...base, secret });
  assert.equal(await verifySvixSignature({ ...base, signatureHeader, secret: "" }), false);
  assert.equal(await verifySvixSignature({ ...base, signatureHeader: "", secret }), false);
  assert.equal(await verifySvixSignature({ ...base, id: "", signatureHeader, secret }), false);
  assert.equal(await verifySvixSignature({ ...base, signatureHeader, secret: "whsec_%%%not-base64%%%" }), false);
  assert.equal(await verifySvixSignature({ ...base, signatureHeader: "garbage", secret }), false);
});
