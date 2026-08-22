// PUT /api/community/password  { password }
// Sets (or, with an empty string, removes) the signed-in member's optional
// password. No "current password" is asked for: possession of a valid
// session is the proof of identity, and the magic link — which requires
// the member's inbox — is the recovery path either way.

import { requireMember, hashPassword } from "../../lib/community-auth.js";

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

  const password = String(payload.password ?? "");

  if (password === "") {
    await env.SITE_DB.prepare(
      "UPDATE community_members SET password_hash = '' WHERE id = ?"
    )
      .bind(member.id)
      .run();
    return Response.json({ ok: true, removed: true });
  }

  if (password.length < 8) {
    return Response.json(
      { error: "Passwords need at least 8 characters." },
      { status: 400 }
    );
  }
  if (password.length > 200) {
    return Response.json(
      { error: "That password is too long." },
      { status: 400 }
    );
  }

  const hash = await hashPassword(password);
  await env.SITE_DB.prepare(
    "UPDATE community_members SET password_hash = ? WHERE id = ?"
  )
    .bind(hash, member.id)
    .run();

  return Response.json({ ok: true });
}
