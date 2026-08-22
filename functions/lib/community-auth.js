// Shared auth helpers for the Montessori Adolescent Collective.
//
// Design notes:
// - Sign-in is by emailed magic link, or by an optional password the
//   member sets themselves. Members without a password lose nothing;
//   the magic link doubles as the "forgot password" path.
// - Both login tokens and session tokens are stored as SHA-256 hashes,
//   and passwords as salted PBKDF2. The raw values only ever live in the
//   member's email, cookie, or head, so a database dump does not let
//   anyone sign in as somebody else.

const SESSION_COOKIE = "apc_session";
// Long-lived on purpose: members stay signed in on a device until they
// sign out, so the magic-link dance is a first-visit cost, not a ritual.
const SESSION_DAYS = 180;
const LOGIN_TOKEN_MINUTES = 20;

export function generateId(prefix = "") {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}${ts}-${rand}`;
}

// 32 random bytes, base64url — used for both magic links and sessions.
export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Passwords (optional) ------------------------------------
// PBKDF2-SHA256 via WebCrypto — bcrypt/argon2 aren't available in
// Workers. Stored as "v1$<iterations>$<salt b64url>$<hash b64url>".

const PBKDF2_ITERATIONS = 100000;

function toB64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `v1$${PBKDF2_ITERATIONS}$${toB64url(salt)}$${toB64url(bits)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [version, iterStr, saltB64, hashB64] = String(stored || "").split("$");
    if (version !== "v1") return false;
    const iterations = Number(iterStr);
    if (!Number.isInteger(iterations) || iterations < 1) return false;
    const bits = await pbkdf2(password, fromB64url(saltB64), iterations);
    const a = new Uint8Array(bits);
    const b = fromB64url(hashB64);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

// --- Sessions ------------------------------------------------

export function sessionCookie(token, { maxAgeSeconds } = {}) {
  const maxAge = maxAgeSeconds ?? SESSION_DAYS * 24 * 60 * 60;
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function createSession(env, memberId, userAgent = "") {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await env.SITE_DB.prepare(
    `INSERT INTO community_sessions (token_hash, member_id, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(tokenHash, memberId, now.toISOString(), expires.toISOString(), userAgent.slice(0, 300))
    .run();

  return token;
}

// Returns the member row for a valid session, or null.
export async function getMember(context) {
  const { env, request } = context;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();

  const row = await env.SITE_DB.prepare(
    `SELECT m.* FROM community_sessions s
     JOIN community_members m ON m.id = s.member_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(tokenHash, now)
    .first();

  if (!row) return null;
  // A suspended member keeps their cookie but loses all access.
  if (row.status !== "active") return null;
  return row;
}

// Days of access after a payment fails, before we close the door. Stripe
// retries during this window, so a card that expires on a Friday doesn't
// lock someone out over the weekend.
const GRACE_DAYS = 3;

// Has this member's subscription lapsed?
//
// A member with no subscription_id is comped — that covers Jarin, the
// team, and anyone added by hand — and never lapses.
export function membershipLapsed(member) {
  if (!member?.subscription_id) return false;

  // Signed up but never actually paid.
  if (member.subscription_status === "incomplete_expired") return true;

  const endsAt = Date.parse(member.current_period_end || "");

  if (Number.isNaN(endsAt)) {
    // No period we can trust, so fall back to the status alone.
    return ["canceled", "unpaid"].includes(member.subscription_status);
  }

  // Otherwise the paid-for period decides it, including after a
  // cancellation — we promise access runs to the end of what you paid for,
  // so cancelling mid-period must not lock someone out on the spot.
  return Date.now() > endsAt + GRACE_DAYS * 24 * 60 * 60 * 1000;
}

// Guard for member-only endpoints. Returns { member } or { response }.
export async function requireMember(context) {
  const member = await getMember(context);
  if (!member) {
    return {
      response: Response.json(
        { error: "Please sign in to continue.", code: "signed_out" },
        { status: 401 }
      ),
    };
  }
  if (membershipLapsed(member)) {
    // 402 rather than 403: this is fixable by the member, and the client
    // uses the code to send them to billing instead of to the login page.
    return {
      response: Response.json(
        {
          error: "Your membership dues are unpaid, so the Collective is on hold.",
          code: "lapsed",
        },
        { status: 402 }
      ),
    };
  }
  return { member };
}

export async function destroySession(context) {
  const { env, request } = context;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  const tokenHash = await hashToken(token);
  await env.SITE_DB.prepare("DELETE FROM community_sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
}

// --- Magic-link tokens ---------------------------------------

export async function createLoginToken(env, email, ip = "") {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + LOGIN_TOKEN_MINUTES * 60 * 1000);

  await env.SITE_DB.prepare(
    `INSERT INTO community_login_tokens (token_hash, email, created_at, expires_at, ip_address)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(tokenHash, email, now.toISOString(), expires.toISOString(), ip)
    .run();

  return { token, expiresMinutes: LOGIN_TOKEN_MINUTES };
}

// Single-use: marks the token consumed and returns the email, or null.
export async function consumeLoginToken(env, token) {
  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();

  const row = await env.SITE_DB.prepare(
    `SELECT * FROM community_login_tokens
     WHERE token_hash = ? AND expires_at > ? AND used_at = ''`
  )
    .bind(tokenHash, now)
    .first();

  if (!row) return null;

  await env.SITE_DB.prepare(
    "UPDATE community_login_tokens SET used_at = ? WHERE token_hash = ?"
  )
    .bind(now, tokenHash)
    .run();

  return row.email;
}

// --- Shaping data for the client ------------------------------
// Never send email addresses of other members to the browser.
export function publicMember(m) {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name || "Member",
    avatar_url: m.avatar_url || "",
    bio: m.bio || "",
    location: m.location || "",
    handle: m.handle || "",
    open_to_exchange: !!m.open_to_exchange,
    role: m.role,
  };
}

export { SESSION_COOKIE };
