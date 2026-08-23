import { getTemplate, renderTemplate } from "../lib/email-templates.js";
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

export async function onRequestPost(context) {
  const { env, request } = context;
  const { firstName, lastName, email } = await request.json();

  if (!firstName || !email) {
    return Response.json({ error: "firstName and email are required" }, { status: 400 });
  }

  if (firstName.length > 100 || (lastName && lastName.length > 100)) {
    return Response.json({ error: "Name too long" }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return Response.json({ error: "Invalid email address" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date().toISOString();

  // Check if already exists
  const existing = await env.SITE_DB.prepare(
    "SELECT * FROM subscribers WHERE email = ?"
  ).bind(normalizedEmail).first();

  if (existing && !existing.unsubscribed) {
    return Response.json({ success: true, message: "You're already subscribed!" });
  }

  if (existing && existing.unsubscribed) {
    // Re-subscribe
    await env.SITE_DB.prepare(
      "UPDATE subscribers SET unsubscribed = 0, resubscribedAt = ?, firstName = ?, lastName = ? WHERE email = ?"
    ).bind(now, firstName, lastName || "", normalizedEmail).run();
  } else {
    await env.SITE_DB.prepare(
      "INSERT INTO subscribers (email, firstName, lastName, subscribedAt) VALUES (?, ?, ?, ?)"
    ).bind(normalizedEmail, firstName, lastName || "", now).run();
  }

  // Get count
  const { results: countResults } = await env.SITE_DB.prepare(
    "SELECT COUNT(*) as count FROM subscribers WHERE unsubscribed = 0"
  ).all();
  const count = countResults[0]?.count || 0;

  // Send welcome email (fire and forget)
  if (env.RESEND_API_KEY) {
    const unsubToken = env.UNSUBSCRIBE_SECRET ? await hmacToken(normalizedEmail, env.UNSUBSCRIBE_SECRET) : "";
    const unsubUrl = `https://montessoriforadolescents.com/api/unsubscribe?email=${encodeURIComponent(normalizedEmail)}&token=${unsubToken}`;

    const isResub = existing && existing.unsubscribed;
    const tpl = renderTemplate(await getTemplate(env, "subscriber-welcome"), {
      welcome_word: isResub ? "Welcome back" : "Welcome",
      first_name: firstName,
      unsub_url: unsubUrl,
      site: "https://montessoriforadolescents.com",
    });
    const subject = isResub ? "Welcome back!" : tpl.subject;

    context.waitUntil(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
          to: [normalizedEmail],
          subject,
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          html: tpl.html,
        }),
      }).catch(() => {})
    );

    // Notify admin
    if (env.ADMIN_EMAIL) {
      context.waitUntil(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
            to: [env.ADMIN_EMAIL],
            subject: `${isResub ? "Re-subscriber" : "New subscriber"}: ${firstName} ${lastName || ""}`.trim(),
            html: `<p><strong>${firstName} ${lastName || ""}</strong> (${normalizedEmail}) just ${isResub ? "re-subscribed" : "subscribed"}. Total active: ${count}.</p>`,
          }),
        }).catch(() => {})
      );
    }
  }

  return Response.json({
    success: true,
    message: existing?.unsubscribed
      ? "Welcome back! You've been re-subscribed."
      : "You're subscribed! Check your inbox for a welcome email.",
    count,
  });
}
