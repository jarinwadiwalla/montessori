// POST /api/community/auth-verify  { token }
// Exchanges a magic-link token for a session cookie.

import {
  consumeLoginToken,
  createSession,
  sessionCookie,
  publicMember,
} from "../../lib/community-auth.js";

export async function onRequestPost(context) {
  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = String(payload.token || "");
  if (!token) {
    return Response.json({ error: "Missing sign-in token." }, { status: 400 });
  }

  const email = await consumeLoginToken(env, token);
  if (!email) {
    return Response.json(
      { error: "This sign-in link has expired or already been used. Please request a new one." },
      { status: 400 }
    );
  }

  const member = await env.SITE_DB.prepare(
    "SELECT * FROM community_members WHERE email = ?"
  )
    .bind(email)
    .first();

  if (!member || member.status !== "active") {
    return Response.json(
      { error: "That membership is no longer active." },
      { status: 403 }
    );
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
