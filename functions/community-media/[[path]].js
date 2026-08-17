// GET /community-media/<r2 key>
// Serves member-uploaded files from R2, but only to signed-in members.
// Because these are same-origin requests the session cookie is sent
// automatically, so <img src="/community-media/..."> just works for
// members and 404s for everyone else.

import { getMember } from "../lib/community-auth.js";

export async function onRequestGet(context) {
  const { env, params } = context;

  const member = await getMember(context);
  if (!member) {
    return new Response("Not found", { status: 404 });
  }

  const segments = Array.isArray(params.path) ? params.path : [params.path];
  const key = segments.filter(Boolean).join("/");

  // Only ever read from the community prefix.
  if (!key.startsWith("community/") || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");
  // Never let an uploaded file execute in our origin's context.
  headers.set("Content-Security-Policy", "default-src 'none'; object-src 'none'; sandbox");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(object.body, { headers });
}
