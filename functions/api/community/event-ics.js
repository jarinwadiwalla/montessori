// GET /api/community/event-ics?id=<event id> — the event as a calendar file.
//
// Members only: the file carries the joining link. Served as a real URL
// rather than built in the page, because a phone opens a text/calendar
// response straight into its calendar where a generated download often
// just saves a file nobody finds again.

import { requireMember } from "../../lib/community-auth.js";
import { buildIcs, icsFilename } from "../../lib/calendar.js";

export async function onRequestGet(context) {
  const { response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return Response.json({ error: "Missing event id." }, { status: 400 });

  const event = await env.SITE_DB.prepare(
    `SELECT id, title, description, starts_at, ends_at, timezone_note,
            location, link, status, updated_at
     FROM community_events WHERE id = ?`
  )
    .bind(id)
    .first();

  if (!event || event.status !== "visible") {
    return Response.json({ error: "That event is no longer open." }, { status: 404 });
  }

  const ics = buildIcs(event);
  if (!ics) return Response.json({ error: "That event has no date yet." }, { status: 404 });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename(event)}"`,
      // It holds the joining link; nothing between us and the member
      // should keep a copy.
      "Cache-Control": "private, no-store",
    },
  });
}
