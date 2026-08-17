// POST /api/community/auth-request  { email }
// Emails a single-use sign-in link. Always returns the same response
// whether or not the address belongs to a member, so this endpoint
// cannot be used to discover who is in the community.

import {
  normalizeEmail,
  isValidEmail,
  createLoginToken,
} from "../../lib/community-auth.js";

const SITE = "https://montessoriforadolescents.com";
const FROM = "Adolescent Practitioners Collective <newsletter@montessoriforadolescents.com>";

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

    context.waitUntil(
      sendEmail(
        env,
        email,
        "Your sign-in link for the Collective",
        `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#3f265b;">
           <p>Hello${member.name ? ` ${escapeHtml(member.name)}` : ""},</p>
           <p>Here is your sign-in link for the Adolescent Practitioners Collective:</p>
           <p style="margin:28px 0;">
             <a href="${link}" style="background:#3f265b;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">Sign in to the Collective</a>
           </p>
           <p style="color:#6b5b7d;font-size:14px;">This link works once and expires in ${expiresMinutes} minutes.
           If you didn't ask to sign in, you can safely ignore this email.</p>
         </div>`
      )
    );
  } else if (member && member.status === "suspended") {
    // Deliberately no sign-in link. Tell them how to reach a human.
    context.waitUntil(
      sendEmail(
        env,
        email,
        "About your Collective membership",
        `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#3f265b;">
           <p>Your membership in the Adolescent Practitioners Collective is currently paused,
           so we weren't able to send a sign-in link.</p>
           <p>If you think this is a mistake, please reply to this email and we'll sort it out.</p>
         </div>`
      )
    );
  } else {
    // Not a member. Send a friendly nudge rather than silence, so a
    // mistyped address doesn't leave someone waiting on a link forever.
    context.waitUntil(
      sendEmail(
        env,
        email,
        "Joining the Adolescent Practitioners Collective",
        `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#3f265b;">
           <p>Someone (hopefully you) asked for a sign-in link for the Adolescent
           Practitioners Collective using this address, but it isn't a member yet.</p>
           <p style="margin:28px 0;">
             <a href="${SITE}/collective/" style="background:#3f265b;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">See what the Collective is</a>
           </p>
           <p style="color:#6b5b7d;font-size:14px;">If you joined with a different email address,
           try requesting a link with that one instead.</p>
         </div>`
      )
    );
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
