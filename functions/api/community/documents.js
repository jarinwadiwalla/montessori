// Documents inside the shared folders.
//
//   POST   /api/community/documents  (multipart: file, folder_id, title?)
//   DELETE /api/community/documents  { id }
//
// Upload and the database row happen in one request, so a file can never
// land in R2 without a row pointing at it.

import { requireMember, generateId } from "../../lib/community-auth.js";
import {
  MAX_DOCUMENT,
  typeFor,
  sniffFamily,
  familyMatches,
  safeName,
} from "../../lib/community-files.js";

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
  const folderId = String(form.get("folder_id") || "");

  if (!file || typeof file === "string") {
    return Response.json({ error: "No file was received." }, { status: 400 });
  }

  const folder = await env.SITE_DB.prepare(
    "SELECT id FROM community_folders WHERE id = ?"
  )
    .bind(folderId)
    .first();
  if (!folder) {
    return Response.json({ error: "Choose a folder first." }, { status: 400 });
  }

  const declared = file.type || "application/octet-stream";
  const type = typeFor(declared);
  if (!type) {
    return Response.json(
      {
        error:
          "That file type isn't supported. Use a PDF, image, Word, PowerPoint or Excel file.",
      },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return Response.json({ error: "That file appears to be empty." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT) {
    return Response.json(
      { error: `That file is too large. Max ${Math.round(MAX_DOCUMENT / 1024 / 1024)}MB.` },
      { status: 400 }
    );
  }

  // Don't trust the browser's content type — check the bytes agree.
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!familyMatches(type.kind, sniffFamily(bytes), type.ext)) {
    return Response.json(
      { error: "That file doesn't match the type it claims to be." },
      { status: 400 }
    );
  }

  const filename = safeName(file.name || `document.${type.ext}`);
  const title = String(form.get("title") || "").trim().slice(0, 140) || filename;

  const key = `community/${member.id}/${generateId()}.${type.ext}`;
  await env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: {
      contentType: declared,
      cacheControl: "private, max-age=31536000",
    },
    customMetadata: { memberId: member.id, originalName: filename },
  });

  const now = new Date().toISOString();
  const id = generateId("doc_");
  await env.SITE_DB.prepare(
    `INSERT INTO community_documents
       (id, folder_id, member_id, title, filename, kind, url, r2_key, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id, folderId, member.id, title, filename, type.kind,
      `/community-media/${key}`, key, file.size, now
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

  const doc = await env.SITE_DB.prepare(
    "SELECT * FROM community_documents WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!doc) return Response.json({ error: "Not found." }, { status: 404 });

  if (member.role !== "admin" && doc.member_id !== member.id) {
    return Response.json(
      { error: "Only the member who uploaded a document, or an organiser, can remove it." },
      { status: 403 }
    );
  }

  await env.SITE_DB.prepare("DELETE FROM community_documents WHERE id = ?")
    .bind(id)
    .run();

  // Then the bytes. Row first: an orphaned R2 object is invisible and
  // cheap, whereas a row pointing at a deleted file is a broken link.
  if (doc.r2_key && env.MEDIA_BUCKET) {
    context.waitUntil(env.MEDIA_BUCKET.delete(doc.r2_key).catch(() => {}));
  }

  return Response.json({ ok: true });
}
