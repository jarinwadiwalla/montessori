// POST /api/community/auth-password  { email, password }
// Signs in a member who has set an optional password. Members without a
// password (or anyone who forgets theirs) use the magic link instead.

import {
  normalizeEmail,
  verifyPassword,
  createSession,
  sessionCookie,
  publicMember,
} from "../../lib/community-auth.js";

const GENERIC_ERROR =
  "That email and password don't match. If you haven't set a password, use the emailed sign-in link instead.";

// Throttling. auth-request limits sign-in links by counting rows it already
// writes; password sign-in writes nothing on failure, so it needs its own
// record. Only failures are stored, so signing in normally never counts
// against you.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 10;
const MAX_PER_EMAIL = 10;

// Created on demand so this protection does not wait on a migration.
// Self-healing rather than flag-cached: a cached "it exists" goes stale the
// moment the binding points somewhere else, and then silently disables the
// throttle.
async function createAttemptsTable(env) {
  await env.SITE_DB.prepare(
    `CREATE TABLE IF NOT EXISTS community_login_attempts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       ip_address TEXT DEFAULT '',
       email TEXT DEFAULT '',
       created_at TEXT NOT NULL
     )`
  ).run();
  await env.SITE_DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON community_login_attempts(ip_address, created_at)"
  ).run();
  await env.SITE_DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON community_login_attempts(email, created_at)"
  ).run();
}

/** Runs fn, creating the table and retrying once if it is not there yet. */
async function withAttemptsTable(env, fn) {
  try {
    return await fn();
  } catch (err) {
    if (!/no such table/i.test(String(err && err.message ? err.message : err))) throw err;
    await createAttemptsTable(env);
    return await fn();
  }
}

function clientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown"
  );
}

/** True when this IP or this address has failed too often lately. */
async function isThrottled(env, ip, email) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const [byIp, byEmail] = await Promise.all([
    env.SITE_DB.prepare(
      "SELECT COUNT(*) AS n FROM community_login_attempts WHERE ip_address = ? AND created_at > ?"
    ).bind(ip, since).first(),
    env.SITE_DB.prepare(
      "SELECT COUNT(*) AS n FROM community_login_attempts WHERE email = ? AND created_at > ?"
    ).bind(email, since).first(),
  ]);
  return (byIp?.n || 0) >= MAX_PER_IP || (byEmail?.n || 0) >= MAX_PER_EMAIL;
}

async function recordFailure(env, ip, email) {
  const now = new Date();
  await env.SITE_DB.prepare(
    "INSERT INTO community_login_attempts (ip_address, email, created_at) VALUES (?, ?, ?)"
  ).bind(ip, email, now.toISOString()).run();
  // Keep the table from growing without bound.
  await env.SITE_DB.prepare(
    "DELETE FROM community_login_attempts WHERE created_at < ?"
  ).bind(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()).run();
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  // Throttle before looking anything up, so a refused attempt costs the
  // same whether or not the address belongs to a member.
  //
  // A failure here leaves sign-in working but unthrottled, which is where
  // this endpoint already was. Refusing logins because a counter is
  // unavailable would be the worse trade.
  const ip = clientIp(request);
  let throttling = true;
  try {
    if (await withAttemptsTable(env, () => isThrottled(env, ip, email))) {
      return Response.json(
        { error: "Too many sign-in attempts. Please wait a few minutes, or use the emailed sign-in link." },
        { status: 429 }
      );
    }
  } catch (err) {
    throttling = false;
    console.error("login throttle unavailable", err);
  }

  const member = await env.SITE_DB.prepare(
    "SELECT * FROM community_members WHERE email = ?"
  )
    .bind(email)
    .first();

  // One generic message for every failure mode, so this endpoint can't be
  // used to probe who is a member or who has a password.
  if (!member || member.status !== "active" || !member.password_hash) {
    if (throttling) await withAttemptsTable(env, () => recordFailure(env, ip, email)).catch(() => {});
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (!(await verifyPassword(password, member.password_hash))) {
    if (throttling) await withAttemptsTable(env, () => recordFailure(env, ip, email)).catch(() => {});
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const sessionToken = await createSession(
    env,
    member.id,
    request.headers.get("User-Agent") || ""
  );

  await env.SITE_DB.prepare(
    "UPDATE community_members SET last_seen_at = ? WHERE id = ?"
  )
    .bind(new Date().toISOString(), member.id)
    .run();

  return new Response(
    JSON.stringify({
      ok: true,
      member: publicMember(member),
      needsProfile: !member.name,
      needsGuidelines: !member.guidelines_accepted_at,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie(sessionToken),
      },
    }
  );
}
