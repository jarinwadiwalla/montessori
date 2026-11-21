// Hands Guru the admin token, and is therefore the most sensitive endpoint
// on the site: the token it returns unlocks the subscriber list, newsletter
// sending, and publishing to the repo.
//
// It is NOT behind Cloudflare Access at the edge — it answers directly — so
// the Access session must be proved here. A verified RS256 JWT is the only
// thing that counts; the mere presence of a CF_Authorization cookie is not,
// because the client sets cookies.

import { verifyAccessJwt } from "../lib/cf-access.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.ADMIN_TOKEN) {
    return Response.json({ token: null, auth_enabled: false });
  }

  const claims = await verifyAccessJwt(request, env);
  if (!claims) {
    return Response.json(
      { error: "Access denied. A verified Cloudflare Access session is required." },
      { status: 403 }
    );
  }

  return Response.json({ token: env.ADMIN_TOKEN, auth_enabled: true });
}
