const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
};

export async function onRequest(context) {
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
  const host = new URL(context.request.url).hostname;
  if (host === "test.montessoriforadolescents.com") {
    newResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return newResponse;
}
