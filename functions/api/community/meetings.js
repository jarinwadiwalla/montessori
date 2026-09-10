// GET  /api/community/meetings          the gatherings, next one first
// POST /api/community/meetings          { event_id, action: 'host' | 'unhost' }
// PUT  /api/community/meetings          { event_id, agenda }
//
// Meetings are not a separate thing from events: they are the gatherings
// already in community_events, read through a different lens. Keeping one
// table means a gathering can never appear on the Events page but go
// missing from Meetings.

import { requireMember } from "../../lib/community-auth.js";

const HOSTABLE = "gathering";

function shape(row, memberId, isAdmin) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    starts_at: row.starts_at,
    timezone_note: row.timezone_note || "",
    location: row.location || "",
    link: row.link || "",
    agenda: row.agenda || "",
    host_name: row.host_name || "",
    host_member_id: row.host_member_id || "",
    is_host: !!row.host_member_id && row.host_member_id === memberId,
    // Only an unclaimed meeting still to come can be taken on.
    can_host: !row.host_member_id && row.starts_at > new Date().toISOString(),
    can_edit_agenda:
      isAdmin || (!!row.host_member_id && row.host_member_id === memberId),
  };
}

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;
  const isAdmin = member.role === 'admin';

  const { results } = await context.env.SITE_DB.prepare(
    `SELECT * FROM community_events
      WHERE status = 'visible' AND kind = ?
      ORDER BY starts_at ASC`
  )
    .bind(HOSTABLE)
    .all();

  const now = new Date().toISOString();
  const all = (results || []).map((r) => shape(r, member.id, isAdmin));

  return Response.json({
    upcoming: all.filter((m) => m.starts_at >= now),
    past: all.filter((m) => m.starts_at < now).reverse(),
  });
}

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const eventId = String(payload.event_id || "");
  const action = String(payload.action || "");
  if (!eventId || !["host", "unhost"].includes(action)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const row = await context.env.SITE_DB.prepare(
    "SELECT id, starts_at, host_member_id FROM community_events WHERE id = ? AND status = 'visible' AND kind = ?"
  )
    .bind(eventId, HOSTABLE)
    .first();
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  const now = new Date().toISOString();
  if (row.starts_at < now) {
    return Response.json(
      { error: "That meeting has already happened." },
      { status: 400 }
    );
  }

  if (action === "host") {
    // Conditional on the slot still being free, so two people pressing at
    // once cannot both end up believing they are the host.
    const res = await context.env.SITE_DB.prepare(
      `UPDATE community_events
          SET host_member_id = ?, host_name = ?, updated_at = ?
        WHERE id = ? AND (host_member_id IS NULL OR host_member_id = '')`
    )
      .bind(member.id, member.name || "", now, eventId)
      .run();
    if (!res.meta.changes) {
      return Response.json(
        { error: "Someone else just signed up to host that one." },
        { status: 409 }
      );
    }
  } else {
    const res = await context.env.SITE_DB.prepare(
      `UPDATE community_events
          SET host_member_id = '', host_name = '', updated_at = ?
        WHERE id = ? AND host_member_id = ?`
    )
      .bind(now, eventId, member.id)
      .run();
    if (!res.meta.changes) {
      return Response.json(
        { error: "You are not hosting that meeting." },
        { status: 403 }
      );
    }
  }

  return Response.json({ ok: true });
}

export async function onRequestPut(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const isAdmin = member.role === 'admin';
  const eventId = String(payload.event_id || "");
  const agenda = String(payload.agenda ?? "").slice(0, 5000);
  if (!eventId) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const row = await context.env.SITE_DB.prepare(
    "SELECT id, host_member_id FROM community_events WHERE id = ? AND status = 'visible' AND kind = ?"
  )
    .bind(eventId, HOSTABLE)
    .first();
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  if (!isAdmin && row.host_member_id !== member.id) {
    return Response.json(
      { error: "Only the host can write the agenda." },
      { status: 403 }
    );
  }

  await context.env.SITE_DB.prepare(
    "UPDATE community_events SET agenda = ?, updated_at = ? WHERE id = ?"
  )
    .bind(agenda, new Date().toISOString(), eventId)
    .run();

  return Response.json({ ok: true, agenda });
}
