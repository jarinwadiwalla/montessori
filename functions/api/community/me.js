// GET  /api/community/me — who am I?
// PUT  /api/community/me — update my profile (name, avatar, bio)

import { getMember, requireMember, publicMember } from "../../lib/community-auth.js";

export async function onRequestGet(context) {
  const member = await getMember(context);
  if (!member) {
    return Response.json({ signedIn: false }, { status: 200 });
  }
  return Response.json({
    signedIn: true,
    member: { ...publicMember(member), email: member.email },
    needsProfile: !member.name,
  });
}

export async function onRequestPut(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = String(payload.name ?? member.name ?? "").trim();
  const bio = String(payload.bio ?? member.bio ?? "").trim();
  const avatarUrl = String(payload.avatar_url ?? member.avatar_url ?? "").trim();

  if (!name) {
    return Response.json({ error: "Please add a display name." }, { status: 400 });
  }
  if (name.length > 60) {
    return Response.json({ error: "Name must be 60 characters or fewer." }, { status: 400 });
  }
  if (bio.length > 400) {
    return Response.json({ error: "Bio must be 400 characters or fewer." }, { status: 400 });
  }
  // Only accept avatars we host, so a profile image can't be used to
  // point at arbitrary third-party URLs.
  if (avatarUrl && !isAllowedMediaUrl(env, avatarUrl)) {
    return Response.json({ error: "That image could not be used." }, { status: 400 });
  }

  await env.SITE_DB.prepare(
    "UPDATE community_members SET name = ?, bio = ?, avatar_url = ? WHERE id = ?"
  )
    .bind(name, bio, avatarUrl, member.id)
    .run();

  const updated = await env.SITE_DB.prepare(
    "SELECT * FROM community_members WHERE id = ?"
  )
    .bind(member.id)
    .first();

  return Response.json({ ok: true, member: publicMember(updated) });
}

function isAllowedMediaUrl(env, url) {
  const cdn = (env.CDN_URL || "").replace(/\/+$/, "");
  if (cdn && url.startsWith(cdn + "/")) return true;
  return url.startsWith("/community-media/");
}
