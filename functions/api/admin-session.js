import { hasCloudflareAccessSession } from "../lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.ADMIN_TOKEN) {
    return Response.json({ token: null, auth_enabled: false });
  }

  if (!hasCloudflareAccessSession(request)) {
    return Response.json(
      { error: "Access denied. Cloudflare Access session required." },
      { status: 403 }
    );
  }

  return Response.json({ token: env.ADMIN_TOKEN, auth_enabled: true });
}
