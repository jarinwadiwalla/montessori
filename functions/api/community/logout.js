// POST /api/community/logout — ends the current session.

import { destroySession, clearSessionCookie } from "../../lib/community-auth.js";

export async function onRequestPost(context) {
  await destroySession(context);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
