// Booking endpoint for the 30-minute introductory partnership call, held on
// Google Meet.
//
// GET  returns the slots already taken, so the picker can grey them out.
// POST claims a slot and emails both sides.
//
// A slot is claimed by an INSERT on a UNIQUE column rather than by checking
// first and writing after: two people clicking the same time within a second
// of each other would both pass a check, and only one can have the call.

const FROM = "Montessori for Adolescents <newsletter@montessoriforadolescents.com>";
const HOST_EMAIL = "jarin.wadiwalla@gmail.com";
const CALL_MINUTES = 30;
// The standing Google Meet room for these calls. Set MEET_LINK as a Pages
// environment variable to change it without a deploy; the constant is the
// fallback. While it is empty the confirmation promises a link by email
// instead of showing a broken button, so a booking is never spoiled by a
// missing setting.
const DEFAULT_MEET_LINK = "";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only future slots matter; anything past is noise the picker never shows. */
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    `SELECT slot_iso FROM call_bookings
     WHERE status = 'booked' AND slot_iso > ?`
  ).bind(new Date().toISOString()).all();

  return Response.json({ taken: results.map((r) => r.slot_iso) });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Bots fill the hidden field; people never see it. Answer as though it
  // worked so they learn nothing.
  if (String(body.website || "").trim()) {
    return Response.json({ ok: true });
  }

  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().slice(0, 200);
  const phone = String(body.phone || "").trim().slice(0, 60);
  const note = String(body.note || "").trim().slice(0, 2000);
  const slotIso = String(body.slotIso || "").trim();
  const slotVisitor = String(body.slotVisitor || "").trim().slice(0, 200);
  const slotHost = String(body.slotHost || "").trim().slice(0, 200);
  const visitorTz = String(body.visitorTz || "").trim().slice(0, 80);
  const about = String(body.about || "Partnership").trim().slice(0, 60);

  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response("Missing or invalid fields", { status: 400 });
  }

  const when = new Date(slotIso);
  if (!slotIso || Number.isNaN(when.getTime())) {
    return new Response("Invalid slot", { status: 400 });
  }
  if (when.getTime() < Date.now()) {
    return new Response("That time has already passed", { status: 409 });
  }

  // Claim the slot. slot_iso is UNIQUE, so a second booker loses here
  // rather than two people arriving in the same Meet room.
  try {
    await env.SITE_DB.prepare(
      `INSERT INTO call_bookings
         (slot_iso, name, email, phone, note, visitor_tz, slot_visitor, slot_host, about, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?)`
    ).bind(
      when.toISOString(), name, email, phone, note, visitorTz,
      slotVisitor, slotHost, about, new Date().toISOString()
    ).run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      return new Response("That time has just been taken", { status: 409 });
    }
    throw err;
  }

  const meetLink = (env.MEET_LINK || DEFAULT_MEET_LINK || "").trim();
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    // The slot is held either way; losing the email is recoverable, losing
    // the booking is not.
    console.error("RESEND_API_KEY is not set — booking saved, no email sent");
    return Response.json({ ok: true, emailed: false });
  }

  const send = (payload) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  const shell = (inner) => `
    <div style="font-family:Georgia,serif;max-width:560px;color:#4A3F35;line-height:1.7;">
      ${inner}
      <p style="margin-top:2rem;font-size:13px;color:#6E5D50;">
        Montessori for Adolescents &middot; montessoriforadolescents.com
      </p>
    </div>`;

  const detail = `
    <table style="border-collapse:collapse;margin:1rem 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#6E5D50;">When</td><td>${esc(slotHost)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6E5D50;">Their time</td><td>${esc(slotVisitor)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6E5D50;">Name</td><td>${esc(name)}</td></tr>
      ${phone ? `<tr><td style="padding:4px 12px 4px 0;color:#6E5D50;">Phone</td><td>${esc(phone)}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#6E5D50;">Email</td><td>${esc(email)}</td></tr>
    </table>
    ${note ? `<p style="background:#EEE4DB;border-left:3px solid #D0905B;padding:12px 16px;">${esc(note)}</p>` : ""}`;

  const results = await Promise.allSettled([
    send({
      from: FROM,
      to: [HOST_EMAIL],
      reply_to: email,
      subject: `${about} call booked — ${name}`,
      html: shell(`<h2 style="font-weight:normal;">A ${CALL_MINUTES}-minute call is booked</h2>${detail}
        <p style="font-size:14px;color:#6E5D50;">
          ${meetLink ? `On Google Meet: <a href="${esc(meetLink)}">${esc(meetLink)}</a>` : "No Google Meet link is configured yet, so send one to them."}
          <br>Reply to this email to reach ${esc(name)}.
        </p>`),
    }),
    send({
      from: FROM,
      to: [email],
      reply_to: HOST_EMAIL,
      subject: `Your call is booked — ${slotVisitor || "confirmed"}`,
      html: shell(`
        <h2 style="font-weight:normal;">Your call is booked</h2>
        <p>Thank you for booking a ${CALL_MINUTES}-minute call. Here are the details:</p>
        <table style="border-collapse:collapse;margin:1rem 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#6E5D50;">When</td><td><strong>${esc(slotVisitor)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6E5D50;">Length</td><td>${CALL_MINUTES} minutes</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6E5D50;">Where</td><td>Google Meet, on video</td></tr>
        </table>
        ${meetLink ? `
        <table cellpadding="0" cellspacing="0" style="margin:1.5rem 0;">
          <tr><td style="background:#D0905B;border-radius:8px;">
            <a href="${esc(meetLink)}" style="display:block;padding:14px 32px;color:#3E312A;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;">Join on Google Meet</a>
          </td></tr>
        </table>
        <p style="font-size:14px;color:#6E5D50;">Or paste this into your browser:<br>
          <a href="${esc(meetLink)}" style="color:#96552B;word-break:break-all;">${esc(meetLink)}</a></p>`
        : `<p>I will email you the Google Meet link before we speak.</p>`}
        <p>If you need to move it or cancel, simply reply to this email.</p>
        <p>Looking forward to speaking,<br>Jarin</p>`),
    }),
  ]);

  const emailed = results.every((r) => r.status === "fulfilled" && r.value.ok);
  if (!emailed) console.error("book-call: one or more emails failed", results);

  return Response.json({ ok: true, emailed });
}
