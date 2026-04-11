export function hasCloudflareAccessSession(request) {
  const jwtHeader = request.headers.get("Cf-Access-Jwt-Assertion");
  if (jwtHeader) return true;

  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader.includes("CF_Authorization=");
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
