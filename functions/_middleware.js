const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
};

// The apex is the canonical host. The site also answers on www, and a
// session cookie is host-only — no Domain attribute — so signing in on one
// host leaves you signed out on the other. Every sign-in link points at the
// apex, so a member who arrives at www looks logged out however recently
// they signed in, and asks for another login email. Send www to the apex.
//
// test.montessoriforadolescents.com is deliberately a separate mirror and is
// left alone; it carries its own noindex below. It is a separate cookie jar
// too, so signing in there does not sign you in on the live site.
const CANONICAL_HOST = "montessoriforadolescents.com";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  // A CORS preflight does not follow redirects, so let OPTIONS through and
  // let the actual request be the thing that moves.
  if (url.hostname === `www.${CANONICAL_HOST}` && context.request.method !== "OPTIONS") {
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 301);
  }

  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const response = await context.next();
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newResponse.headers.set(key, value);
  }

  // The test subdomain mirrors the whole site; keep every page of it out
  // of search engines.
  if (url.hostname === `test.${CANONICAL_HOST}`) {
    newResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return newResponse;
}
