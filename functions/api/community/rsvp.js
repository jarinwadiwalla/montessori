// POST   /api/community/rsvp  { event_id }  — I'm coming
// DELETE /api/community/rsvp  { event_id }  — actually, I'm not

import { requireMember } from "../../lib/community-auth.js";

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const payload = await safeJson(request);
  const eventId = String(payload?.event_id || "");
  if (!eventId) return Response.json({ error: "Missing event id." }, { status: 400 });

  const event = await env.SITE_DB.prepare(
    "SELECT id, capacity, status FROM community_events WHERE id = ?"
  )
    .bind(eventId)
    .first();

  if (!event || event.status !== "visible") {
    return Response.json({ error: "That event is no longer open." }, { status: 404 });
  }

  // Respect capacity, but never block someone already on the list.
  if (event.capacity > 0) {
    const existing = await env.SITE_DB.prepare(
      "SELECT 1 AS x FROM community_event_rsvps WHERE event_id = ? AND member_id = ?"
    )
      .bind(eventId, member.id)
      .first();

    if (!existing) {
      const row = await env.SITE_DB.prepare(
        "SELECT COUNT(*) AS n FROM community_event_rsvps WHERE event_id = ?"
      )
        .bind(eventId)
        .first();
      if ((row?.n || 0) >= event.capacity) {
        return Response.json({ error: "This event is full." }, { status: 409 });
      }
    }
  }

  await env.SITE_DB.prepare(
    `INSERT INTO community_event_rsvps (event_id, member_id, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(event_id, member_id) DO NOTHING`
  )
    .bind(eventId, member.id, new Date().toISOString())
    .run();

  const count = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_event_rsvps WHERE event_id = ?"
  )
    .bind(eventId)
    .first();

  return Response.json({ ok: true, going: true, rsvp_count: count?.n || 0 });
}

export async function onRequestDelete(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const payload = await safeJson(request);
  const eventId = String(payload?.event_id || "");
  if (!eventId) return Response.json({ error: "Missing event id." }, { status: 400 });

  await env.SITE_DB.prepare(
    "DELETE FROM community_event_rsvps WHERE event_id = ? AND member_id = ?"
  )
    .bind(eventId, member.id)
    .run();

  const count = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_event_rsvps WHERE event_id = ?"
  )
    .bind(eventId)
    .first();

  return Response.json({ ok: true, going: false, rsvp_count: count?.n || 0 });
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
