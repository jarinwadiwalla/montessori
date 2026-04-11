import { requireAdmin } from "../lib/auth.js";

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const contentType = request.headers.get("Content-Type") || "";

  let key, fileData, mimeType;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    key = formData.get("key");

    if (!file || !key) {
      return Response.json({ error: "file and key are required" }, { status: 400 });
    }

    fileData = await file.arrayBuffer();
    mimeType = file.type || "application/octet-stream";
  } else {
    // Raw binary upload with key in header/query
    const url = new URL(request.url);
    key = url.searchParams.get("key") || request.headers.get("X-Upload-Key");

    if (!key) {
      return Response.json({ error: "key is required" }, { status: 400 });
    }

    fileData = await request.arrayBuffer();
    mimeType = request.headers.get("X-Content-Type") || "application/octet-stream";
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (fileData.byteLength > maxSize) {
    return Response.json({ error: "File too large. Max 10MB." }, { status: 400 });
  }

  await env.MEDIA_BUCKET.put(key, fileData, {
    httpMetadata: { contentType: mimeType },
  });

  const cdnUrl = env.CDN_URL ? `${env.CDN_URL}/${key}` : `/media/${key}`;

  return Response.json({
    ok: true,
    url: cdnUrl,
    key,
  });
}
