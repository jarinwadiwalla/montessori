// The Collective's photo gallery.
//
//   GET    /api/community/photos?album_id=<id>          — newest first
//   POST   /api/community/photos  (multipart: file, album_id, caption?, width?, height?)
//   DELETE /api/community/photos  { id }
//
// Images only. The browser downscales before uploading, so what arrives
// here is already a sensible size; the limit below is a backstop rather
// than the usual case.

import { requireMember, generateId } from "../../lib/community-auth.js";
import { sniffFamily, safeName } from "../../lib/community-files.js";

const MAX_PHOTO = 8 * 1024 * 1024; // 8 MB
const PAGE = 60;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;
  const isAdmin = member.role === "admin";

  // Scoped to one album; the gallery only ever shows a wall of pictures
  // once you're inside one.
  const albumId = new URL(context.request.url).searchParams.get("album_id") || "";

  const { results } = await env.SITE_DB.prepare(
    `SELECT p.*, m.name AS uploader_name, m.avatar_url AS uploader_avatar
     FROM community_photos p
     LEFT JOIN community_members m ON m.id = p.member_id
     WHERE p.album_id = ?
     ORDER BY p.created_at DESC
     LIMIT ?`
  )
    .bind(albumId, PAGE)
    .all();

  return Response.json({
    photos: (results || []).map((p) => ({
      id: p.id,
      caption: p.caption || "",
      url: p.url,
      width: p.width || 0,
      height: p.height || 0,
      created_at: p.created_at,
      uploader_name: p.uploader_name || "A member",
      uploader_avatar: p.uploader_avatar || "",
      can_delete: isAdmin || p.member_id === member.id,
    })),
  });
}

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;

  if (!env.MEDIA_BUCKET) {
    return Response.json({ error: "File storage isn't configured yet." }, { status: 503 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No photo was received." }, { status: 400 });
  }

  const albumId = String(form.get("album_id") || "");
  const album = await env.SITE_DB.prepare(
    "SELECT id FROM community_albums WHERE id = ?"
  ).bind(albumId).first();
  if (!album) {
    return Response.json({ error: "Open an album first." }, { status: 400 });
  }

  const declared = file.type || "";
  const ext = IMAGE_TYPES[declared];
  if (!ext) {
    return Response.json(
      { error: "Photos only — JPG, PNG, GIF or WebP." },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "That file appears to be empty." }, { status: 400 });
  }
  if (file.size > MAX_PHOTO) {
    return Response.json(
      { error: `That photo is too large. Max ${Math.round(MAX_PHOTO / 1024 / 1024)}MB.` },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffFamily(bytes) !== "image") {
    return Response.json({ error: "That doesn't look like an image." }, { status: 400 });
  }

  const key = `community/${member.id}/${generateId()}.${ext}`;
  await env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: declared, cacheControl: "private, max-age=31536000" },
    customMetadata: { memberId: member.id, originalName: safeName(file.name || "") },
  });

  // Dimensions come from the browser, which has already decoded the image.
  // Only used to reserve space in the grid, so a bad value costs a layout
  // shift rather than anything worse.
  const width = clampInt(form.get("width"));
  const height = clampInt(form.get("height"));

  const id = generateId("pho_");
  await env.SITE_DB.prepare(
    `INSERT INTO community_photos
       (id, member_id, album_id, caption, url, r2_key, width, height, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      member.id,
      albumId,
      String(form.get("caption") || "").trim().slice(0, 300),
      `/community-media/${key}`,
      key,
      width,
      height,
      new Date().toISOString()
    )
    .run();

  return Response.json({ ok: true, id });
}

export async function onRequestDelete(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const id = String(payload.id || "");
  if (!id) return Response.json({ error: "Invalid request." }, { status: 400 });

  const photo = await env.SITE_DB.prepare(
    "SELECT * FROM community_photos WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!photo) return Response.json({ error: "Not found." }, { status: 404 });

  if (member.role !== "admin" && photo.member_id !== member.id) {
    return Response.json(
      { error: "Only the member who posted a photo, or an organiser, can remove it." },
      { status: 403 }
    );
  }

  await env.SITE_DB.prepare("DELETE FROM community_photos WHERE id = ?").bind(id).run();

  // Row first: an orphaned R2 object is invisible and cheap, a row
  // pointing at a deleted file is a broken image.
  if (photo.r2_key && env.MEDIA_BUCKET) {
    context.waitUntil(env.MEDIA_BUCKET.delete(photo.r2_key).catch(() => {}));
  }

  return Response.json({ ok: true });
}

function clampInt(v) {
  const n = parseInt(String(v || "0"), 10);
  return Number.isFinite(n) && n > 0 && n < 20000 ? n : 0;
}
