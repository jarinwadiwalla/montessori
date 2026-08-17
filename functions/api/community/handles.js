// GET /api/community/handles
//
// Just the @handles of active members. The board uses it to highlight only
// mentions that will actually reach someone — so a typo'd handle looks like
// plain text rather than a successful mention.
//
// Deliberately slim: no names, no emails, nothing but the handles.

import { requireMember } from "../../lib/community-auth.js";

export async function onRequestGet(context) {
  const { response } = await requireMember(context);
  if (response) return response;

  const { env } = context;

  const { results } = await env.SITE_DB.prepare(
    "SELECT handle FROM community_members WHERE status = 'active' AND handle != ''"
  ).all();

  return Response.json(
    { handles: results.map((r) => r.handle) },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
