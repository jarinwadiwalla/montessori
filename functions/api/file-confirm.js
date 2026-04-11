import { requireAdmin } from "../lib/auth.js";

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { key } = await request.json();

  if (!key) {
    return Response.json({ error: "key is required" }, { status: 400 });
  }

  const cdnUrl = env.CDN_URL ? `${env.CDN_URL}/${key}` : `/media/${key}`;

  return Response.json({
    ok: true,
    url: cdnUrl,
    key,
  });
}
