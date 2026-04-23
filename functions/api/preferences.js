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

function renderPage(title, bodyHtml) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family: Georgia, serif; color: #3E312A; background: #FAF7F2; padding: 60px 20px; margin: 0;">
<div style="max-width: 480px; margin: 0 auto; text-align: center;">
  ${bodyHtml}
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
    return renderPage("Invalid Link", `<h1 style="font-size: 24px;">Invalid Link</h1><p style="color: #5A4D42;">This preferences link is missing required information.</p>`);
  }

  if (env.UNSUBSCRIBE_SECRET) {
    const expected = await hmacToken(email, env.UNSUBSCRIBE_SECRET);
    if (token !== expected) {
      return renderPage("Invalid Link", `<h1 style="font-size: 24px;">Invalid Link</h1><p style="color: #5A4D42;">This preferences link is invalid or has expired.</p>`);
    }
  }

  const subscriber = await env.SITE_DB.prepare(
    "SELECT * FROM subscribers WHERE email = ?"
  ).bind(email).first();

  if (!subscriber) {
    return renderPage("Not Found", `<h1 style="font-size: 24px;">Not Found</h1><p style="color: #5A4D42;">This email address is not in our subscriber list.</p>`);
  }

  const currentPref = subscriber.preferences || "all";
  const checkedAll = currentPref === "all" ? "checked" : "";
  const checkedUpdates = currentPref === "updates-only" ? "checked" : "";

  return renderPage("Email Preferences", `
    <h1 style="font-size: 24px; margin-bottom: 8px;">Email Preferences</h1>
    <p style="color: #5A4D42; margin-bottom: 24px;">Choose which emails you'd like to receive at <strong>${email}</strong>.</p>
    <form method="POST" style="text-align: left; max-width: 360px; margin: 0 auto;">
      <input type="hidden" name="email" value="${email}">
      <input type="hidden" name="token" value="${token}">
      <label style="display: block; padding: 16px; margin-bottom: 12px; border: 1px solid #E8E0D8; border-radius: 8px; cursor: pointer; background: white;">
        <input type="radio" name="preference" value="all" ${checkedAll} style="margin-right: 8px;">
        <strong>All emails</strong>
        <br><span style="font-size: 14px; color: #5A4D42; margin-left: 24px;">Blog posts, resources, newsletters, and announcements.</span>
      </label>
      <label style="display: block; padding: 16px; margin-bottom: 12px; border: 1px solid #E8E0D8; border-radius: 8px; cursor: pointer; background: white;">
        <input type="radio" name="preference" value="updates-only" ${checkedUpdates} style="margin-right: 8px;">
        <strong>Important updates only</strong>
        <br><span style="font-size: 14px; color: #5A4D42; margin-left: 24px;">Only major announcements and essential updates.</span>
      </label>
      <button type="submit" style="margin-top: 12px; width: 100%; padding: 12px; background: #B8755D; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-family: Georgia, serif;">Save Preferences</button>
    </form>
  `);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const contentType = request.headers.get("Content-Type") || "";

  let email, token, preference;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    email = body.email;
    token = body.token;
    preference = body.preference;
  } else {
    const formData = await request.formData();
    email = formData.get("email");
    token = formData.get("token");
    preference = formData.get("preference");
  }

  if (!email || !token) {
    return renderPage("Error", `<h1 style="font-size: 24px;">Error</h1><p style="color: #5A4D42;">Missing required information.</p>`);
  }

  if (env.UNSUBSCRIBE_SECRET) {
    const expected = await hmacToken(email, env.UNSUBSCRIBE_SECRET);
    if (token !== expected) {
      return renderPage("Invalid Link", `<h1 style="font-size: 24px;">Invalid Link</h1><p style="color: #5A4D42;">This preferences link is invalid.</p>`);
    }
  }

  const validPrefs = ["all", "updates-only"];
  if (!validPrefs.includes(preference)) {
    preference = "all";
  }

  await env.SITE_DB.prepare(
    "UPDATE subscribers SET preferences = ? WHERE email = ?"
  ).bind(preference, email).run();

  const label = preference === "all" ? "All emails" : "Important updates only";
  return renderPage("Preferences Updated", `
    <h1 style="font-size: 24px; margin-bottom: 16px;">Preferences Updated</h1>
    <p style="color: #5A4D42;">Your email preference has been set to: <strong>${label}</strong>.</p>
  `);
}
