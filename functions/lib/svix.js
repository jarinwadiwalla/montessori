// Resend signs its webhooks with Svix. The signed content is
// "<svix-id>.<svix-timestamp>.<raw body>", HMAC-SHA256'd with the endpoint's
// signing secret, and the header carries one or more "v1,<base64>" values
// separated by spaces (more than one while a secret is being rotated).
//
// Kept apart from the handler so it can be tested without a request.

const TOLERANCE_SECONDS = 300;

function secretBytes(secret) {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
}

async function sign(secret, content) {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Same length, compared in full: no early exit to time.
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// True when `signatureHeader` carries a valid signature for `body` under
// `secret`. Never throws: a malformed secret or header is simply "no".
export async function verifySvixSignature({
  id,
  timestamp,
  signatureHeader,
  body,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  if (!id || !timestamp || !signatureHeader || !secret) return false;

  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;

  let expected;
  try {
    expected = await sign(secret, `${id}.${timestamp}.${body}`);
  } catch {
    return false;
  }

  for (const entry of String(signatureHeader).split(" ")) {
    const comma = entry.indexOf(",");
    if (comma === -1) continue;
    if (sameString(entry.slice(comma + 1), expected)) return true;
  }
  return false;
}

// Exposed for tests and for the local rehearsal script.
export async function signSvixPayload({ id, timestamp, body, secret }) {
  return `v1,${await sign(secret, `${id}.${timestamp}.${body}`)}`;
}
