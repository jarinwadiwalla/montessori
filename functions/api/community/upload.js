// POST /api/community/upload  (multipart/form-data, field "file")
// Stores a member's image or PDF in R2 and returns a URL that only
// signed-in members can read. Videos are never uploaded — they are
// embedded from a link instead.

import { requireMember, generateId } from "../../lib/community-auth.js";

const MAX_IMAGE = 8 * 1024 * 1024; // 8 MB
const MAX_PDF = 20 * 1024 * 1024; // 20 MB

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;

  if (!env.MEDIA_BUCKET) {
    return Response.json(
      { error: "File storage isn't configured yet." },
      { status: 503 }
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No file was received." }, { status: 400 });
  }

  const declaredType = file.type || "application/octet-stream";
  const isPdf = declaredType === "application/pdf";
  const isImage = Object.prototype.hasOwnProperty.call(IMAGE_TYPES, declaredType);

  if (!isPdf && !isImage) {
    return Response.json(
      { error: "Only images (JPG, PNG, GIF, WebP) and PDFs can be attached." },
      { status: 400 }
    );
  }

  const limit = isPdf ? MAX_PDF : MAX_IMAGE;
  if (file.size > limit) {
    return Response.json(
      { error: `That file is too large. Max ${Math.round(limit / 1024 / 1024)}MB.` },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "That file appears to be empty." }, { status: 400 });
  }

  // Verify the file really is what it claims to be, rather than trusting
  // the browser-supplied content type.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffType(bytes);
  if (sniffed !== (isPdf ? "pdf" : "image")) {
    return Response.json(
      { error: "That file doesn't look like a valid image or PDF." },
      { status: 400 }
    );
  }

  const ext = isPdf ? "pdf" : IMAGE_TYPES[declaredType];
  const key = `community/${member.id}/${generateId()}.${ext}`;

  await env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: {
      contentType: declaredType,
      cacheControl: "private, max-age=31536000",
    },
    customMetadata: {
      memberId: member.id,
      originalName: safeName(file.name || ""),
    },
  });

  return Response.json({
    ok: true,
    url: `/community-media/${key}`,
    r2_key: key,
    kind: isPdf ? "pdf" : "image",
    filename: safeName(file.name || ""),
    size: file.size,
  });
}

// Minimal magic-byte check for the formats we accept.
function sniffType(b) {
  if (b.length < 12) return "unknown";
  // %PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image";
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image";
  // GIF8
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image";
  // RIFF....WEBP
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image";
  }
  return "unknown";
}

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._ -]/g, "").slice(0, 120);
}
