// POST /api/community/waitlist  { email }
//
// Collects emails while the Collective is closed. Stored in the existing
// subscribers table with tier 'waitlist', so they show up in Guru, the
// unsubscribe link works, and you can email them from the newsletter tool
// by choosing the "Collective Waitlist" audience.
//
// Kept out of general "All Subscribers" sends on purpose: these people
// asked to hear when the Collective opens, not to join the newsletter.

import { normalizeEmail, isValidEmail } from "../../lib/community-auth.js";

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
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  // Throttle bursts so the form can't be scripted to stuff the list.
  //
  // Deliberately not per-IP: that would mean storing an IP address on the
  // subscribers table, and several existing endpoints read those rows with
  // SELECT *, so the IP could surface in a response. A short global cap is
  // enough to stop a naive script and no real person will ever reach it.
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const recent = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM subscribers WHERE tier = 'waitlist' AND subscribedAt > ?"
  )
    .bind(since)
    .first();

  if ((recent?.n || 0) >= 10) {
    return Response.json(
      { error: "We're a bit busy right now — please try again in a minute." },
      { status: 429 }
    );
  }

  const existing = await env.SITE_DB.prepare(
    "SELECT email, tier, unsubscribed FROM subscribers WHERE email = ?"
  )
    .bind(email)
    .first();

  if (existing) {
    // Someone already on the list — quietly resubscribe them if they had
    // opted out, but never change an existing tier (a donor stays a donor).
    if (existing.unsubscribed) {
      await env.SITE_DB.prepare(
        "UPDATE subscribers SET unsubscribed = 0, resubscribedAt = ? WHERE email = ?"
      )
        .bind(new Date().toISOString(), email)
        .run();
    }
    return Response.json({
      ok: true,
      message: "You're on the list — we'll be in touch when the Collective opens.",
    });
  }

  await env.SITE_DB.prepare(
    `INSERT INTO subscribers
       (email, firstName, lastName, subscribedAt, unsubscribed, preferences, tier)
     VALUES (?, '', '', ?, 0, 'all', 'waitlist')
     ON CONFLICT(email) DO NOTHING`
  )
    .bind(email, new Date().toISOString())
    .run();

  // Let Jarin know someone's waiting.
  if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
    context.waitUntil(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
          to: [env.ADMIN_EMAIL],
          subject: "Someone joined the Collective waitlist",
          html: `<p><strong>${escapeHtml(email)}</strong> joined the Collective waitlist.</p>`,
        }),
      }).catch(() => {})
    );
  }

  return Response.json({
    ok: true,
    message: "You're on the list — we'll be in touch when the Collective opens.",
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
