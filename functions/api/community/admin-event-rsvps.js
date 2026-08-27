// GET /api/community/admin-event-rsvps?event_id=<id>
//
// Who has RSVP'd to an event, with their email addresses, so a joining
// link can be sent out. Admin-only: members' emails are never exposed to
// other members anywhere else in the Collective, and this is the one
// place they leave the database.
//
// Uses requireAdminStrict rather than requireAdmin — the strict version
// refuses when ADMIN_TOKEN is unset instead of falling open.

import { requireAdminStrict } from "../../lib/auth.js";

export async function onRequestGet(context) {
  const denied = requireAdminStrict(context);
  if (denied) return denied;

  const { env, request } = context;
  const eventId = new URL(request.url).searchParams.get("event_id") || "";
  if (!eventId) {
    return Response.json({ error: "Which event?" }, { status: 400 });
  }

  const event = await env.SITE_DB.prepare(
    "SELECT id, title, starts_at, timezone_note, location, link FROM community_events WHERE id = ?"
  )
    .bind(eventId)
    .first();
  if (!event) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { results } = await env.SITE_DB.prepare(
    `SELECT m.name, m.email, m.country, r.created_at
     FROM community_event_rsvps r
     JOIN community_members m ON m.id = r.member_id
     WHERE r.event_id = ? AND m.status = 'active'
     ORDER BY r.created_at ASC`
  )
    .bind(eventId)
    .all();

  const going = results || [];

  return Response.json({
    event: {
      id: event.id,
      title: event.title,
      starts_at: event.starts_at,
      timezone_note: event.timezone_note || "",
      location: event.location || "",
      link: event.link || "",
    },
    count: going.length,
    going: going.map((r) => ({
      name: r.name || "Member",
      email: r.email,
      country: r.country || "",
      rsvped_at: r.created_at,
    })),
    // Ready to paste straight into the Bcc field of an email.
    emails: going.map((r) => r.email).join(", "),
  });
}
