// Who may watch a paid webinar recording, and how they prove it.
//
// Three tables (schema/webinar-recordings.sql):
//   webinar_recordings    — one row per recording on sale: the player's
//                           address and the Stripe products that buy it.
//                           The address is kept here because the repo and
//                           the built site are both public.
//   webinar_access        — who has bought which recording, by email.
//   webinar_access_tokens — emailed links and browser sessions, stored as
//                           SHA-256 hashes like the Collective's tokens.
//
// A browser gets in by holding a token for an email that has a row in
// webinar_access. Membership of the Collective is not a way in: recordings
// are sold separately (CHANGELOG 1.4.0).

import { generateToken, hashToken, normalizeEmail } from "./community-auth.js";
import { getTemplate, renderTemplate } from "./email-templates.js";

const SITE = "https://montessoriforadolescents.com";
const FROM = "Montessori for Adolescents <newsletter@montessoriforadolescents.com>";

const ACCESS_COOKIE = "mfa_recording";
// A buyer stays signed in to their recording for a year on that browser.
const SESSION_DAYS = 365;
// The emailed link can be used more than once: mail scanners open links
// before people do, which would burn a single-use one, and buyers keep the
// email to come back to. It still lapses, and a fresh one is one form away.
const LINK_DAYS = 30;

// Where the watch page's frame leaves room for the player. Must match the
// comment in src/pages/webinars/[id]/watch.astro.
export const PLAYER_SLOT = "<!--recording-player-->";

const DAY_MS = 24 * 60 * 60 * 1000;

export const watchPath = (webinarId) => `/webinars/${webinarId}/watch/`;

export function isWebinarId(id) {
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(String(id || ""));
}

// The recording's row, or null — including when the tables are missing,
// so a deploy that got ahead of its schema closes the door instead of
// throwing.
export async function getRecording(env, webinarId) {
  if (!isWebinarId(webinarId)) return null;
  try {
    return await env.SITE_DB.prepare(
      "SELECT * FROM webinar_recordings WHERE webinar_id = ?"
    )
      .bind(webinarId)
      .first();
  } catch {
    return null;
  }
}

function productIds(recording) {
  return String(recording?.stripe_product_ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// `price.product` is an id, unless the caller asked Stripe to expand it.
function boughtProducts(items) {
  return (items || [])
    .map((i) => i.price?.product)
    .map((p) => (typeof p === "string" ? p : p?.id))
    .filter(Boolean);
}

// --- entitlement ------------------------------------------------

export async function hasAccess(env, webinarId, email) {
  if (!email) return false;
  const row = await env.SITE_DB.prepare(
    "SELECT 1 AS ok FROM webinar_access WHERE webinar_id = ? AND email = ?"
  )
    .bind(webinarId, email)
    .first();
  return !!row;
}

export async function grantAccess(env, webinarId, email, { source = "", paymentId = "" } = {}) {
  await env.SITE_DB.prepare(
    `INSERT OR IGNORE INTO webinar_access
       (webinar_id, email, source, payment_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(webinarId, email, source, paymentId, new Date().toISOString())
    .run();
}

// --- tokens: emailed links and browser sessions -------------------

async function createToken(env, webinarId, email, kind, days, ip = "") {
  const token = generateToken();
  const now = new Date();
  await env.SITE_DB.prepare(
    `INSERT INTO webinar_access_tokens
       (token_hash, webinar_id, email, kind, created_at, expires_at, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      await hashToken(token),
      webinarId,
      email,
      kind,
      now.toISOString(),
      new Date(now.getTime() + days * DAY_MS).toISOString(),
      ip
    )
    .run();
  return token;
}

// The email a live token of this kind was issued to, for this recording,
// provided that email still has access. Null for anything else.
async function emailForToken(env, webinarId, token, kind) {
  if (!token) return null;
  const row = await env.SITE_DB.prepare(
    `SELECT t.email FROM webinar_access_tokens t
     JOIN webinar_access a ON a.webinar_id = t.webinar_id AND a.email = t.email
     WHERE t.token_hash = ? AND t.webinar_id = ? AND t.kind = ? AND t.expires_at > ?`
  )
    .bind(await hashToken(token), webinarId, kind, new Date().toISOString())
    .first();
  return row?.email || null;
}

export const emailForLink = (env, webinarId, token) =>
  emailForToken(env, webinarId, token, "link");

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

// The buyer this browser is signed in as for this recording, or null.
export function viewerEmail(context, webinarId) {
  const token = readCookie(context.request, ACCESS_COOKIE);
  return emailForToken(context.env, webinarId, token, "session");
}

// Start a browser session and return its Set-Cookie value. The cookie is
// scoped to the one webinar's pages, so each recording has its own.
export async function startSession(env, webinarId, email) {
  const token = await createToken(env, webinarId, email, "session", SESSION_DAYS);
  return [
    `${ACCESS_COOKIE}=${token}`,
    `Path=/webinars/${webinarId}/`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ].join("; ");
}

// --- proof of purchase from Stripe --------------------------------

// Ask Stripe about a Checkout Session. Returns { email, paymentId } when it
// is complete, paid, and for one of this recording's products; otherwise
// null. A session id is only a claim until Stripe confirms it.
export async function verifyCheckoutSession(env, recording, sessionId) {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!/^cs_[A-Za-z0-9_]{1,200}$/.test(String(sessionId || ""))) return null;

  let session;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=line_items`,
      { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }
    );
    if (!res.ok) return null;
    session = await res.json();
  } catch {
    return null;
  }

  if (session.status !== "complete") return null;
  // "no_payment_required" is a completed checkout a coupon took to zero.
  if (!["paid", "no_payment_required"].includes(session.payment_status)) return null;

  const wanted = productIds(recording);
  if (!boughtProducts(session.line_items?.data).some((id) => wanted.includes(id))) {
    return null;
  }

  const email = normalizeEmail(
    session.customer_details?.email || session.customer_email || ""
  );
  if (!email) return null;
  return { email, paymentId: session.payment_intent || session.id };
}

// Called for every paid checkout the webhook and the Stripe sync see: if
// it bought a recording, give the buyer's email access to it. With
// `notify`, also email them their link — once, however often Stripe
// retries the event.
export async function grantRecordingsForCheckout(context, session, items, { notify = false, source = "checkout" } = {}) {
  const { env } = context;
  const email = normalizeEmail(
    session.customer_details?.email || session.customer_email || ""
  );
  const bought = boughtProducts(items);
  if (!email || !bought.length) return;

  const { results } = await env.SITE_DB.prepare(
    "SELECT * FROM webinar_recordings WHERE stripe_product_ids != ''"
  ).all();

  for (const recording of results) {
    if (!productIds(recording).some((id) => bought.includes(id))) continue;

    await grantAccess(env, recording.webinar_id, email, {
      source,
      paymentId: session.payment_intent || session.id || "",
    });
    if (!notify) continue;

    const claimed = await env.SITE_DB.prepare(
      `UPDATE webinar_access SET link_sent_at = ?
       WHERE webinar_id = ? AND email = ? AND link_sent_at = ''`
    )
      .bind(new Date().toISOString(), recording.webinar_id, email)
      .run();
    if (claimed.meta.changes) await sendAccessLink(context, recording, email, "stripe");
  }
}

// --- the email that carries the link ------------------------------

// How many links this address was sent for this recording since `since`.
export async function recentLinkCount(env, webinarId, email, since) {
  const row = await env.SITE_DB.prepare(
    `SELECT COUNT(*) AS count FROM webinar_access_tokens
     WHERE webinar_id = ? AND email = ? AND kind = 'link' AND created_at > ?`
  )
    .bind(webinarId, email, since)
    .first();
  return row?.count || 0;
}

export async function sendAccessLink(context, recording, email, ip = "") {
  const { env } = context;
  if (!env.RESEND_API_KEY) return;

  const token = await createToken(env, recording.webinar_id, email, "link", LINK_DAYS, ip);
  const tpl = renderTemplate(await getTemplate(env, "recording-access-link"), {
    title: recording.title || "your webinar recording",
    link: `${SITE}${watchPath(recording.webinar_id)}?key=${encodeURIComponent(token)}`,
    expires_in: `${LINK_DAYS} days`,
    recording_page: `${SITE}/webinars/${recording.webinar_id}/`,
  });

  context.waitUntil(
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [email], subject: tpl.subject, html: tpl.html }),
    }).catch(() => {})
  );
}
