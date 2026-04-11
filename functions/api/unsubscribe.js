async function hmacToken(email, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function renderPage(title, message, showButton = false, email = "", token = "") {
  const buttonHtml = showButton
    ? `<form method="POST" style="margin-top: 24px;">
        <input type="hidden" name="email" value="${email}">
        <input type="hidden" name="token" value="${token}">
        <button type="submit" style="padding: 12px 32px; background: #B8755D; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-family: Georgia, serif;">Confirm Unsubscribe</button>
       </form>`
    : "";

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family: Georgia, serif; color: #3E312A; background: #FAF7F2; padding: 60px 20px; margin: 0;">
<div style="max-width: 480px; margin: 0 auto; text-align: center;">
  <h1 style="font-size: 24px; margin-bottom: 16px;">${title}</h1>
  <p style="line-height: 1.7; color: #5A4D42;">${message}</p>
  ${buttonHtml}
  <p style="margin-top: 32px; font-size: 14px; color: #9B8E82;"><a href="https://montessoriforadolescents.com" style="color: #B8755D;">Back to Montessori for Adolescents</a></p>
</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!email || !token) {
    return renderPage("Invalid Link", "This unsubscribe link is missing required information.");
  }

  if (env.UNSUBSCRIBE_SECRET) {
    const expected = await hmacToken(email, env.UNSUBSCRIBE_SECRET);
    if (token !== expected) {
      return renderPage("Invalid Link", "This unsubscribe link is invalid or has expired.");
    }
  }

  const subscriber = await env.SITE_DB.prepare(
    "SELECT * FROM subscribers WHERE email = ?"
  ).bind(email).first();

  if (!subscriber) {
    return renderPage("Not Found", "This email address is not in our subscriber list.");
  }

  if (subscriber.unsubscribed) {
    return renderPage("Already Unsubscribed", "You have already been unsubscribed from our newsletter.");
  }

  return renderPage(
    "Unsubscribe",
    `Are you sure you want to unsubscribe <strong>${email}</strong> from the Montessori for Adolescents newsletter?`,
    true,
    email,
    token
  );
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const contentType = request.headers.get("Content-Type") || "";

  let email, token;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    email = body.email;
    token = body.token;
  } else {
    const formData = await request.formData();
    email = formData.get("email");
    token = formData.get("token");
  }

  if (!email || !token) {
    return renderPage("Error", "Missing required information.");
  }

  if (env.UNSUBSCRIBE_SECRET) {
    const expected = await hmacToken(email, env.UNSUBSCRIBE_SECRET);
    if (token !== expected) {
      return renderPage("Invalid Link", "This unsubscribe link is invalid.");
    }
  }

  const now = new Date().toISOString();
  await env.SITE_DB.prepare(
    "UPDATE subscribers SET unsubscribed = 1, unsubscribedAt = ? WHERE email = ?"
  ).bind(now, email).run();

  return renderPage(
    "Unsubscribed",
    "You have been successfully unsubscribed. We're sorry to see you go."
  );
}
