// Photo albums in the Collective's gallery.
//
//   GET    /api/community/albums   — every album, with a cover and a count
//   POST   /api/community/albums   — create  { name }
//   PUT    /api/community/albums   — rename  { id, name }
//                                    reorder { action: 'move', id, direction }
//   DELETE /api/community/albums   — remove  { id }
//
// Mirrors folders.js deliberately: same permission model, same refusal to
// delete something with contents, so the two libraries behave alike.

import { requireMember, generateId } from "../../lib/community-auth.js";

const MAX_NAME = 80;

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;
  const isAdmin = member.role === "admin";

  const [albums, photos] = await Promise.all([
    env.SITE_DB.prepare(
      "SELECT * FROM community_albums ORDER BY sort_order ASC, name ASC"
    ).all(),
    // Only what a cover and a count need, rather than every row's payload.
    env.SITE_DB.prepare(
      `SELECT album_id, url, created_at FROM community_photos
       ORDER BY created_at DESC`
    ).all(),
  ]);

  const counts = {};
  const covers = {};
  for (const p of photos.results || []) {
    const key = p.album_id || "";
    counts[key] = (counts[key] || 0) + 1;
    // Rows arrive newest first, so the first one seen is the cover.
    if (!covers[key]) covers[key] = p.url;
  }

  return Response.json({
    is_admin: isAdmin,
    albums: (albums.results || []).map((a) => ({
      id: a.id,
      name: a.name,
      is_system: !!a.is_system,
      count: counts[a.id] || 0,
      cover: covers[a.id] || "",
      can_edit: isAdmin || (!a.is_system && a.created_by === member.id),
    })),
    // Photos uploaded before albums existed, if any are still unfiled.
    unfiled: counts[""] || 0,
  });
}

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;
  const payload = await readJson(context);
  if (!payload) return badRequest();

  const name = cleanName(payload.name);
  if (!name) return Response.json({ error: "Give the album a name." }, { status: 400 });

  const clash = await env.SITE_DB.prepare(
    "SELECT id FROM community_albums WHERE lower(name) = lower(?)"
  ).bind(name).first();
  if (clash) {
    return Response.json({ error: "There's already an album with that name." }, { status: 409 });
  }

  const last = await env.SITE_DB.prepare(
    "SELECT MAX(sort_order) AS n FROM community_albums"
  ).first();

  const now = new Date().toISOString();
  const id = generateId("alb_");
  await env.SITE_DB.prepare(
    `INSERT INTO community_albums
       (id, name, created_by, is_system, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  )
    .bind(id, name, member.id, (last?.n || 0) + 10, now, now)
    .run();

  return Response.json({ ok: true, id, name });
}

export async function onRequestPut(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;
  const payload = await readJson(context);
  if (!payload) return badRequest();

  if (payload.action === "move") return moveAlbum(context, member, payload);

  const id = String(payload.id || "");
  const name = cleanName(payload.name);
  if (!id || !name) return badRequest();

  const album = await env.SITE_DB.prepare(
    "SELECT * FROM community_albums WHERE id = ?"
  ).bind(id).first();
  if (!album) return Response.json({ error: "Not found." }, { status: 404 });

  if (!canEdit(member, album)) {
    return Response.json(
      { error: "Only the member who created an album, or an organiser, can rename it." },
      { status: 403 }
    );
  }

  const clash = await env.SITE_DB.prepare(
    "SELECT id FROM community_albums WHERE lower(name) = lower(?) AND id != ?"
  ).bind(name, id).first();
  if (clash) {
    return Response.json({ error: "There's already an album with that name." }, { status: 409 });
  }

  await env.SITE_DB.prepare(
    "UPDATE community_albums SET name = ?, updated_at = ? WHERE id = ?"
  ).bind(name, new Date().toISOString(), id).run();

  return Response.json({ ok: true, id, name });
}

export async function onRequestDelete(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;
  const payload = await readJson(context);
  if (!payload) return badRequest();

  const id = String(payload.id || "");
  if (!id) return badRequest();

  const album = await env.SITE_DB.prepare(
    "SELECT * FROM community_albums WHERE id = ?"
  ).bind(id).first();
  if (!album) return Response.json({ error: "Not found." }, { status: 404 });

  if (!canEdit(member, album)) {
    return Response.json(
      { error: "Only the member who created an album, or an organiser, can delete it." },
      { status: 403 }
    );
  }

  // Same rule as folders: refuse rather than take other people's photos
  // down as a side effect.
  const inside = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_photos WHERE album_id = ?"
  ).bind(id).first();
  if ((inside?.n || 0) > 0) {
    return Response.json(
      {
        error: `That album still has ${inside.n} photo${inside.n === 1 ? "" : "s"} in it. Empty it first.`,
      },
      { status: 409 }
    );
  }

  await env.SITE_DB.prepare("DELETE FROM community_albums WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}

async function moveAlbum(context, member, payload) {
  const { env } = context;

  if (member.role !== "admin") {
    return Response.json(
      { error: "Only an organiser can rearrange the albums." },
      { status: 403 }
    );
  }

  const id = String(payload.id || "");
  const direction = payload.direction === "up" ? "up" : "down";
  if (!id) return badRequest();

  const { results } = await env.SITE_DB.prepare(
    "SELECT id, sort_order FROM community_albums ORDER BY sort_order ASC, name ASC"
  ).all();

  const albums = results || [];
  const index = albums.findIndex((a) => a.id === id);
  if (index === -1) return Response.json({ error: "Not found." }, { status: 404 });

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= albums.length) {
    return Response.json({ ok: true, moved: false });
  }

  const a = albums[index];
  const b = albums[swapWith];
  const aOrder = a.sort_order === b.sort_order ? index * 10 : a.sort_order;
  const bOrder = a.sort_order === b.sort_order ? swapWith * 10 : b.sort_order;

  await env.SITE_DB.batch([
    env.SITE_DB.prepare("UPDATE community_albums SET sort_order = ? WHERE id = ?").bind(bOrder, a.id),
    env.SITE_DB.prepare("UPDATE community_albums SET sort_order = ? WHERE id = ?").bind(aOrder, b.id),
  ]);

  return Response.json({ ok: true, moved: true });
}

function canEdit(member, album) {
  if (member.role === "admin") return true;
  if (album.is_system) return false;
  return album.created_by === member.id;
}

function cleanName(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
}

async function readJson(context) {
  try {
    return await context.request.json();
  } catch {
    return null;
  }
}

function badRequest() {
  return Response.json({ error: "Invalid request." }, { status: 400 });
}
