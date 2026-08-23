// GET    /api/community/events?when=upcoming|past — gatherings, guest
//        presentations and retreats
// POST   /api/community/events  — create (admins only)
// PUT    /api/community/events  — edit (admins only)
// DELETE /api/community/events  — cancel (admins only)

import { requireMember, generateId } from "../../lib/community-auth.js";
import { requireAdminStrict } from "../../lib/auth.js";

const KINDS = ["gathering", "presentation", "retreat"];

// Events are managed from Guru (X-Admin-Token) as well as by admin
// members in the portal (session cookie). Either credential works.
async function requireOrganiser(context) {
  if (context.request.headers.get("X-Admin-Token")) {
    const authErr = requireAdminStrict(context);
    if (authErr) return { member: null, response: authErr };
    return { member: { id: "guru-admin", role: "admin" }, response: null };
  }
  const { member, response } = await requireMember(context);
  if (response) return { member: null, response };
  if (member.role !== "admin") {
    return {
      member: null,
      response: Response.json({ error: "Only organisers can manage events." }, { status: 403 }),
    };
  }
  return { member, response: null };
}

export async function onRequestGet(context) {
  // Guru reads the list with the admin token and no member session.
  let member = null;
  if (context.request.headers.get("X-Admin-Token")) {
    const authErr = requireAdminStrict(context);
    if (authErr) return authErr;
  } else {
    const res = await requireMember(context);
    if (res.response) return res.response;
    member = res.member;
  }

  const { env, request } = context;
  const when = new URL(request.url).searchParams.get("when") || "upcoming";
  const now = new Date().toISOString();

  const { results: events } = await env.SITE_DB.prepare(
    when === "past"
      ? `SELECT * FROM community_events
         WHERE starts_at < ? ORDER BY starts_at DESC LIMIT 50`
      : `SELECT * FROM community_events
         WHERE starts_at >= ? ORDER BY starts_at ASC LIMIT 50`
  )
    .bind(now)
    .all();

  // RSVP counts, and whether this member is going, in one pass.
  let counts = {};
  let mine = new Set();
  if (events.length) {
    const ph = events.map(() => "?").join(",");
    const ids = events.map((e) => e.id);

    const { results: rows } = await env.SITE_DB.prepare(
      `SELECT event_id, COUNT(*) AS n FROM community_event_rsvps
       WHERE event_id IN (${ph}) GROUP BY event_id`
    )
      .bind(...ids)
      .all();
    for (const r of rows) counts[r.event_id] = r.n;

    if (member) {
      const { results: myRows } = await env.SITE_DB.prepare(
        `SELECT event_id FROM community_event_rsvps
         WHERE member_id = ? AND event_id IN (${ph})`
      )
        .bind(member.id, ...ids)
        .all();
      mine = new Set(myRows.map((r) => r.event_id));
    }
  }

  return Response.json({
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      description: e.description || "",
      starts_at: e.starts_at,
      ends_at: e.ends_at || "",
      timezone_note: e.timezone_note || "",
      location: e.location || "",
      link: e.link || "",
      host_name: e.host_name || "",
      capacity: e.capacity || 0,
      status: e.status,
      rsvp_count: counts[e.id] || 0,
      going: mine.has(e.id),
    })),
    can_manage: !member || member.role === "admin",
  });
}

export async function onRequestPost(context) {
  const { member, response } = await requireOrganiser(context);
  if (response) return response;

  const { env, request } = context;
  const payload = await safeJson(request);
  if (!payload) return Response.json({ error: "Invalid request." }, { status: 400 });

  const invalid = validate(payload);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const id = generateId("evt_");
  const now = new Date().toISOString();

  await env.SITE_DB.prepare(
    `INSERT INTO community_events
       (id, kind, title, description, starts_at, ends_at, timezone_note,
        location, link, host_name, capacity, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'visible', ?, ?, ?)`
  )
    .bind(
      id,
      payload.kind,
      String(payload.title).trim().slice(0, 140),
      String(payload.description || "").trim().slice(0, 3000),
      new Date(payload.starts_at).toISOString(),
      payload.ends_at ? new Date(payload.ends_at).toISOString() : "",
      String(payload.timezone_note || "").slice(0, 120),
      String(payload.location || "").slice(0, 160),
      String(payload.link || "").slice(0, 500),
      String(payload.host_name || "").slice(0, 120),
      Number(payload.capacity) || 0,
      member.id,
      now,
      now
    )
    .run();

  return Response.json({ ok: true, id });
}

export async function onRequestPut(context) {
  const { member, response } = await requireOrganiser(context);
  if (response) return response;

  const { env, request } = context;
  const payload = await safeJson(request);
  if (!payload?.id) return Response.json({ error: "Missing event id." }, { status: 400 });

  const invalid = validate(payload);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  await env.SITE_DB.prepare(
    `UPDATE community_events
     SET kind = ?, title = ?, description = ?, starts_at = ?, ends_at = ?,
         timezone_note = ?, location = ?, link = ?, host_name = ?,
         capacity = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(
      payload.kind,
      String(payload.title).trim().slice(0, 140),
      String(payload.description || "").trim().slice(0, 3000),
      new Date(payload.starts_at).toISOString(),
      payload.ends_at ? new Date(payload.ends_at).toISOString() : "",
      String(payload.timezone_note || "").slice(0, 120),
      String(payload.location || "").slice(0, 160),
      String(payload.link || "").slice(0, 500),
      String(payload.host_name || "").slice(0, 120),
      Number(payload.capacity) || 0,
      new Date().toISOString(),
      payload.id
    )
    .run();

  return Response.json({ ok: true });
}

export async function onRequestDelete(context) {
  const { member, response } = await requireOrganiser(context);
  if (response) return response;

  const { env, request } = context;
  const payload = await safeJson(request);
  if (!payload?.id) return Response.json({ error: "Missing event id." }, { status: 400 });

  // Keep the row so people who RSVP'd still see it was cancelled.
  await env.SITE_DB.prepare(
    "UPDATE community_events SET status = 'cancelled', updated_at = ? WHERE id = ?"
  )
    .bind(new Date().toISOString(), payload.id)
    .run();

  return Response.json({ ok: true });
}

function validate(p) {
  if (!KINDS.includes(p.kind)) {
    return "Choose a gathering, presentation or retreat.";
  }
  if (!String(p.title || "").trim()) return "Give the event a title.";
  if (!p.starts_at || Number.isNaN(Date.parse(p.starts_at))) {
    return "Add a valid start date and time.";
  }
  if (p.ends_at && Number.isNaN(Date.parse(p.ends_at))) {
    return "That end date isn't valid.";
  }
  if (p.ends_at && Date.parse(p.ends_at) < Date.parse(p.starts_at)) {
    return "The end time can't be before the start time.";
  }
  const link = String(p.link || "").trim();
  if (link && !/^https:\/\//i.test(link)) {
    return "Links must start with https://";
  }
  return null;
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
