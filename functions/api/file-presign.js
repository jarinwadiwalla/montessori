import { requireAdmin } from "../lib/auth.js";
import { AwsClient } from "aws4fetch";

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { filename, contentType, size } = await request.json();

  if (!filename) {
    return Response.json({ error: "filename is required" }, { status: 400 });
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (size && size > maxSize) {
    return Response.json({ error: "File too large. Max 10MB." }, { status: 400 });
  }

  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `images/${timestamp}-${sanitized}`;

  // If R2 binding is available, generate a presigned URL using aws4fetch
  if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT) {
    const aws = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });

    const url = new URL(`${env.R2_ENDPOINT}/${env.R2_BUCKET_NAME || "montessori-media"}/${key}`);
    url.searchParams.set("X-Amz-Expires", "3600");

    const signed = await aws.sign(
      new Request(url, {
        method: "PUT",
        headers: { "Content-Type": contentType || "application/octet-stream" },
      }),
      { aws: { signQuery: true } }
    );

    return Response.json({
      uploadUrl: signed.url,
      key,
      cdnUrl: `${env.CDN_URL || ""}/${key}`,
    });
  }

  // Fallback: direct upload via our own endpoint
  return Response.json({
    uploadUrl: `/api/image-upload`,
    key,
    method: "direct",
  });
}
