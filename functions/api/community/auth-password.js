// POST /api/community/auth-password  { email, password }
// Signs in a member who has set an optional password. Members without a
// password (or anyone who forgets theirs) use the magic link instead.

import {
  normalizeEmail,
  verifyPassword,
  createSession,
  sessionCookie,
  publicMember,
} from "../../lib/community-auth.js";

const GENERIC_ERROR =
  "That email and password don't match. If you haven't set a password, use the emailed sign-in link instead.";

export async function onRequestPost(context) {
  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const member = await env.SITE_DB.prepare(
    "SELECT * FROM community_members WHERE email = ?"
  )
    .bind(email)
    .first();

  // One generic message for every failure mode, so this endpoint can't be
  // used to probe who is a member or who has a password.
  if (!member || member.status !== "active" || !member.password_hash) {
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (!(await verifyPassword(password, member.password_hash))) {
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const sessionToken = await createSession(
    env,
    member.id,
    request.headers.get("User-Agent") || ""
  );

  await env.SITE_DB.prepare(
    "UPDATE community_members SET last_seen_at = ? WHERE id = ?"
  )
    .bind(new Date().toISOString(), member.id)
    .run();

  return new Response(
    JSON.stringify({
      ok: true,
      member: publicMember(member),
      needsProfile: !member.name,
      needsGuidelines: !member.guidelines_accepted_at,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie(sessionToken),
      },
    }
  );
}
