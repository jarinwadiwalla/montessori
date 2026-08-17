export function hasCloudflareAccessSession(request) {
  const jwtHeader = request.headers.get("Cf-Access-Jwt-Assertion");
  if (jwtHeader) return true;

  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader.includes("CF_Authorization=");
}

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

  if (!env.ADMIN_TOKEN) {
    return null; // fail-open if not configured
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
