// Verifying a Cloudflare Access session.
//
// The old check asked only whether a CF_Authorization cookie was present.
// Cookies are set by the client, so `Cookie: CF_Authorization=anything`
// satisfied it, and /api/admin-session is not itself behind Access — it
// answers directly. That handed the admin token to anyone who asked.
//
// Access issues a signed RS256 JWT. The only sound check is to verify that
// signature against the team's published keys and then the claims. Both
// identifiers below are public: they appear in the redirect Access sends an
// unauthenticated browser to, so they are safe in a public repo. They can
// still be overridden per-environment.

const DEFAULT_TEAM_DOMAIN = "wadiwalla.cloudflareaccess.com";
const DEFAULT_AUD = "2ded9a019c54b290d43b3b3d9c7ac20dfc79c0d38b03a879f4d4859b6166c293";

// Cloudflare rotates signing keys, so the key set is refetched hourly
// rather than held for the life of the isolate.
const JWKS_TTL_MS = 60 * 60 * 1000;
let jwksCache = null;
let jwksFetchedAt = 0;

function b64urlToBytes(s) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

async function getJwks(teamDomain) {
  const now = Date.now();
  if (jwksCache && now - jwksFetchedAt < JWKS_TTL_MS) return jwksCache;

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body.keys) || !body.keys.length) throw new Error("JWKS empty");

  jwksCache = body.keys;
  jwksFetchedAt = now;
  return jwksCache;
}

/**
 * Returns the verified Access claims, or null.
 *
 * Null covers every failure — absent, malformed, wrongly signed, expired,
 * or issued for a different application — because the caller's only correct
 * response to any of them is to refuse.
 */
export async function verifyAccessJwt(request, env = {}) {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN || DEFAULT_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD || DEFAULT_AUD;
  if (!teamDomain || !aud) return null;

  // Access sets the header on requests it proxies. The cookie is the same
  // JWT, and is accepted only because it is verified below.
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    readCookie(request, "CF_Authorization");
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch {
    return null;
  }

  if (header.alg !== "RS256") return null;

  // Claims first: cheap, and avoids a network call for an expired token.
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return null;
  if (payload.iss !== `https://${teamDomain}`) return null;

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) return null;

  let keys;
  try {
    keys = await getJwks(teamDomain);
  } catch {
    return null; // cannot verify, so do not allow
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return ok ? payload : null;
  } catch {
    return null;
  }
}
