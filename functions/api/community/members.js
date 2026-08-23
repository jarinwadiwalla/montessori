// GET /api/community/members?exchange=1&q=bali
// The member directory. Members only — and email addresses are never
// included in the response, so the directory cannot be scraped for
// contact details. Members reach each other through the board.

import { requireMember } from "../../lib/community-auth.js";

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;
  const url = new URL(request.url);
  const exchangeOnly = url.searchParams.get("exchange") === "1";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 60);

  let sql = `SELECT id, name, avatar_url, bio, location, country, handle, open_to_exchange, role, joined_at
             FROM community_members
             WHERE status = 'active' AND name != ''`;
  const binds = [];

  if (exchangeOnly) {
    sql += " AND open_to_exchange = 1";
  }
  if (q) {
    sql += " AND (lower(name) LIKE ? OR lower(location) LIKE ? OR lower(bio) LIKE ? OR handle LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY open_to_exchange DESC, joined_at ASC LIMIT 500";

  const { results } = await env.SITE_DB.prepare(sql).bind(...binds).all();

  return Response.json({
    members: results.map((m) => ({
      id: m.id,
      name: m.name,
      avatar_url: m.avatar_url || "",
      bio: m.bio || "",
      location: m.location || "",
      country: m.country || "",
      handle: m.handle || "",
      open_to_exchange: !!m.open_to_exchange,
      role: m.role,
      joined_at: m.joined_at,
      is_you: m.id === member.id,
    })),
    total: results.length,
  });
}
