export async function onRequestPost(context) {
  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.type;
  const data = payload.data;

  if (!data || !data.email_id) {
    return Response.json({ ok: true, message: "No email_id, skipping" });
  }

  // Handle bounces and complaints by unsubscribing
  if (eventType === "email.bounced" || eventType === "email.complained") {
    const toAddresses = Array.isArray(data.to) ? data.to : [data.to];

    for (const email of toAddresses) {
      if (!email) continue;
      const now = new Date().toISOString();
      await env.SITE_DB.prepare(
        "UPDATE subscribers SET unsubscribed = 1, unsubscribedAt = ? WHERE email = ? AND unsubscribed = 0"
      ).bind(now, email.toLowerCase().trim()).run();
    }
  }

  return Response.json({ ok: true });
}
