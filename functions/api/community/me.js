// GET  /api/community/me — who am I?
// PUT  /api/community/me — update my profile (name, avatar, bio)

import { ensureHandle } from "../../lib/community-mentions.js";
import {
  getMember,
  requireMember,
  publicMember,
  membershipLapsed,
} from "../../lib/community-auth.js";

export async function onRequestGet(context) {
  const member = await getMember(context);
  if (!member) {
    return Response.json({ signedIn: false }, { status: 200 });
  }
  return Response.json({
    signedIn: true,
    member: { ...publicMember(member), email: member.email },
    needsProfile: !member.name,
    lapsed: membershipLapsed(member),
    membership: {
      // Empty plan means comped — no dues, nothing to manage.
      plan: member.plan || "",
      status: member.subscription_status || "",
      renews_at: member.current_period_end || "",
      cancelling: !!member.cancel_at_period_end,
      has_billing: !!member.stripe_customer_id,
    },
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
  const location = String(payload.location ?? member.location ?? "").trim();
  const openToExchange =
    payload.open_to_exchange === undefined
      ? member.open_to_exchange
        ? 1
        : 0
      : payload.open_to_exchange
        ? 1
        : 0;

  if (!name) {
    return Response.json({ error: "Please add a display name." }, { status: 400 });
  }
  if (name.length > 60) {
    return Response.json({ error: "Name must be 60 characters or fewer." }, { status: 400 });
  }
  if (bio.length > 400) {
    return Response.json({ error: "Bio must be 400 characters or fewer." }, { status: 400 });
  }
  if (location.length > 80) {
    return Response.json({ error: "Location must be 80 characters or fewer." }, { status: 400 });
  }
  // Only accept avatars we host, so a profile image can't be used to
  // point at arbitrary third-party URLs.
  if (avatarUrl && !isAllowedMediaUrl(env, avatarUrl)) {
    return Response.json({ error: "That image could not be used." }, { status: 400 });
  }

  await env.SITE_DB.prepare(
    `UPDATE community_members
     SET name = ?, bio = ?, avatar_url = ?, location = ?, open_to_exchange = ?
     WHERE id = ?`
  )
    .bind(name, bio, avatarUrl, location, openToExchange, member.id)
    .run();

  // Their @handle follows their display name.
  await ensureHandle(env, member.id, name);

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
  // Member uploads, plus our own static images (team headshots are
  // seeded from /images/, and must survive a profile edit).
  if (url.startsWith("/community-media/")) return true;
  return url.startsWith("/images/") && !url.includes("..");
}
