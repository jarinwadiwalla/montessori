// Removed: this asked only whether a CF_Authorization cookie was present,
// which the client controls, so any request claiming one passed. Callers
// now use verifyAccessJwt() from ./cf-access.js, which checks the
// signature, audience, issuer and expiry.

// Fail-CLOSED admin guard. Unlike requireAdmin below, a missing
// ADMIN_TOKEN denies the request instead of allowing it. Use this for
// anything that exposes member data or changes who has access.
export function requireAdminStrict(context) {
  const { request, env } = context;

  if (!env.ADMIN_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Admin access is not configured on this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = request.headers.get("X-Admin-Token");
  if (token && token === env.ADMIN_TOKEN) {
    return null;
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function requireAdmin(context) {
  const { request, env } = context;

  // Fail closed. This used to return null — allowing the request — when
  // ADMIN_TOKEN was unset, which would have opened the subscriber list,
  // newsletter sending and repo publishing to anyone the moment the secret
  // went missing from a deployment.
  if (!env.ADMIN_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Admin access is not configured on this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = request.headers.get("X-Admin-Token");
  if (token === env.ADMIN_TOKEN) {
    return null; // authorized
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
