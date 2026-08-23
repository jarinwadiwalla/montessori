// POST /api/community/auth-request  { email }
// Emails a single-use sign-in link. Always returns the same response
// whether or not the address belongs to a member, so this endpoint
// cannot be used to discover who is in the community.

import {
  normalizeEmail,
  isValidEmail,
  createLoginToken,
} from "../../lib/community-auth.js";
import { getTemplate, renderTemplate, greetingName } from "../../lib/email-templates.js";

const SITE = "https://montessoriforadolescents.com";
const FROM = "Montessori Adolescent Collective <newsletter@montessoriforadolescents.com>";

async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  }).catch(() => {});
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
  if (!isValidEmail(email)) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // Rate limit by IP: 5 sign-in requests per 15 minutes.
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const recent = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS count FROM community_login_tokens WHERE ip_address = ? AND created_at > ?"
  )
    .bind(ip, windowStart)
    .first();

  if ((recent?.count || 0) >= 5) {
    return Response.json(
      { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const member = await env.SITE_DB.prepare(
    "SELECT id, status, name FROM community_members WHERE email = ?"
  )
    .bind(email)
    .first();

  if (member && member.status === "active") {
    const { token, expiresMinutes } = await createLoginToken(env, email, ip);
    const link = `${SITE}/collective/verify/?token=${encodeURIComponent(token)}`;

    const tpl = renderTemplate(await getTemplate(env, "member-login-link"), {
      greeting_name: greetingName(member.name),
      link,
      expires_minutes: expiresMinutes,
    });
    context.waitUntil(sendEmail(env, email, tpl.subject, tpl.html));
  } else if (member && member.status === "suspended") {
    // Deliberately no sign-in link. Tell them how to reach a human.
    const tpl = renderTemplate(await getTemplate(env, "member-login-suspended"), {});
    context.waitUntil(sendEmail(env, email, tpl.subject, tpl.html));
  } else {
    // Not a member. Send a friendly nudge rather than silence, so a
    // mistyped address doesn't leave someone waiting on a link forever.
    const tpl = renderTemplate(await getTemplate(env, "member-login-not-member"), { site: SITE });
    context.waitUntil(sendEmail(env, email, tpl.subject, tpl.html));
  }

  // Identical response in every branch.
  return Response.json({
    ok: true,
    message: "Check your email — if that address is in the Collective, a sign-in link is on its way.",
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
