// Shared document folders in the members' library.
//
//   GET    /api/community/folders   — every folder with its documents
//   POST   /api/community/folders   — create  { name }
//   PUT    /api/community/folders   — rename  { id, name }
//   DELETE /api/community/folders   — remove  { id }
//
// Any member can create a folder. Renaming and deleting are limited to
// whoever created it, or an organiser. The four seeded folders are marked
// is_system and can be renamed or removed by organisers only — they are
// the shelves everyone else is filing into.

import { requireMember, generateId } from "../../lib/community-auth.js";
import { PREVIEWABLE } from "../../lib/community-files.js";

const MAX_NAME = 80;

export async function onRequestGet(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;

  const [folders, documents] = await Promise.all([
    env.SITE_DB.prepare(
      "SELECT * FROM community_folders ORDER BY is_system DESC, name ASC"
    ).all(),
    env.SITE_DB.prepare(
      `SELECT d.*, m.name AS uploader_name
       FROM community_documents d
       LEFT JOIN community_members m ON m.id = d.member_id
       ORDER BY d.created_at DESC`
    ).all(),
  ]);

  const isAdmin = member.role === "admin";
  const byFolder = {};
  for (const d of documents.results || []) {
    (byFolder[d.folder_id] ||= []).push({
      id: d.id,
      title: d.title,
      filename: d.filename,
      kind: d.kind,
      url: d.url,
      size: d.size,
      created_at: d.created_at,
      uploader_name: d.uploader_name || "A member",
      previewable: PREVIEWABLE.has(d.kind),
      // Whose delete button shows.
      can_delete: isAdmin || d.member_id === member.id,
    });
  }

  return Response.json({
    is_admin: isAdmin,
    folders: (folders.results || []).map((f) => ({
      id: f.id,
      name: f.name,
      is_system: !!f.is_system,
      created_at: f.created_at,
      documents: byFolder[f.id] || [],
      can_edit: isAdmin || (!f.is_system && f.created_by === member.id),
    })),
  });
}

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;
  const payload = await readJson(context);
  if (!payload) return badRequest();

  const name = cleanName(payload.name);
  if (!name) {
    return Response.json({ error: "Give the folder a name." }, { status: 400 });
  }

  const clash = await env.SITE_DB.prepare(
    "SELECT id FROM community_folders WHERE lower(name) = lower(?)"
  )
    .bind(name)
    .first();
  if (clash) {
    return Response.json(
      { error: "There's already a folder with that name." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const id = generateId("fold_");
  await env.SITE_DB.prepare(
    `INSERT INTO community_folders (id, name, created_by, is_system, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`
  )
    .bind(id, name, member.id, now, now)
    .run();

  return Response.json({ ok: true, id, name });
}

export async function onRequestPut(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env } = context;
  const payload = await readJson(context);
  if (!payload) return badRequest();

  const id = String(payload.id || "");
  const name = cleanName(payload.name);
  if (!id || !name) return badRequest();

  const folder = await env.SITE_DB.prepare(
    "SELECT * FROM community_folders WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!folder) return Response.json({ error: "Not found." }, { status: 404 });

  if (!canEdit(member, folder)) {
    return Response.json(
      { error: "Only the member who created a folder, or an organiser, can rename it." },
      { status: 403 }
    );
  }

  const clash = await env.SITE_DB.prepare(
    "SELECT id FROM community_folders WHERE lower(name) = lower(?) AND id != ?"
  )
    .bind(name, id)
    .first();
  if (clash) {
    return Response.json(
      { error: "There's already a folder with that name." },
      { status: 409 }
    );
  }

  await env.SITE_DB.prepare(
    "UPDATE community_folders SET name = ?, updated_at = ? WHERE id = ?"
  )
    .bind(name, new Date().toISOString(), id)
    .run();

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

  const folder = await env.SITE_DB.prepare(
    "SELECT * FROM community_folders WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!folder) return Response.json({ error: "Not found." }, { status: 404 });

  if (!canEdit(member, folder)) {
    return Response.json(
      { error: "Only the member who created a folder, or an organiser, can delete it." },
      { status: 403 }
    );
  }

  // Refuse rather than cascade. Deleting a folder full of other people's
  // work should be a deliberate act, not a side effect of tidying up.
  const contents = await env.SITE_DB.prepare(
    "SELECT COUNT(*) AS n FROM community_documents WHERE folder_id = ?"
  )
    .bind(id)
    .first();
  if ((contents?.n || 0) > 0) {
    return Response.json(
      {
        error: `That folder still has ${contents.n} document${contents.n === 1 ? "" : "s"} in it. Empty it first.`,
      },
      { status: 409 }
    );
  }

  await env.SITE_DB.prepare("DELETE FROM community_folders WHERE id = ?")
    .bind(id)
    .run();

  return Response.json({ ok: true });
}

// --- helpers ---------------------------------------------------

function canEdit(member, folder) {
  if (member.role === "admin") return true;
  if (folder.is_system) return false;
  return folder.created_by === member.id;
}

function cleanName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
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
