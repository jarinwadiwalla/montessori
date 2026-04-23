import { requireAdmin } from "../lib/auth.js";

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { oldEmail, newEmail, firstName, lastName, tier, preference } = await request.json();

  if (!oldEmail) {
    return Response.json({ error: "oldEmail is required" }, { status: 400 });
  }

  const subscriber = await env.SITE_DB.prepare(
    "SELECT * FROM subscribers WHERE email = ?"
  ).bind(oldEmail).first();

  if (!subscriber) {
    return Response.json({ error: "Subscriber not found" }, { status: 404 });
  }

  const changes = [];

  const updatedFirstName = firstName !== undefined ? firstName : subscriber.firstName;
  const updatedLastName = lastName !== undefined ? lastName : subscriber.lastName;
  const updatedTier = tier !== undefined ? tier : (subscriber.tier || "subscriber");
  const updatedPreference = preference !== undefined ? preference : (subscriber.preferences || "all");

  if (firstName !== undefined && firstName !== subscriber.firstName) {
    changes.push(`firstName: ${subscriber.firstName} → ${firstName}`);
  }
  if (lastName !== undefined && lastName !== subscriber.lastName) {
    changes.push(`lastName: ${subscriber.lastName} → ${lastName}`);
  }
  if (tier !== undefined && tier !== (subscriber.tier || "subscriber")) {
    changes.push(`tier: ${subscriber.tier || "subscriber"} → ${tier}`);
  }
  if (preference !== undefined && preference !== (subscriber.preferences || "all")) {
    changes.push(`preference: ${subscriber.preferences || "all"} → ${preference}`);
  }

  // Handle email change
  if (newEmail && newEmail.toLowerCase() !== oldEmail.toLowerCase()) {
    // Check if new email already exists
    const existing = await env.SITE_DB.prepare(
      "SELECT email FROM subscribers WHERE email = ?"
    ).bind(newEmail.toLowerCase()).first();

    if (existing) {
      return Response.json({ error: "A subscriber with that email already exists" }, { status: 409 });
    }

    changes.push(`email: ${oldEmail} → ${newEmail}`);

    // Insert new record, delete old
    await env.SITE_DB.prepare(
      `INSERT INTO subscribers (email, firstName, lastName, subscribedAt, unsubscribed, unsubscribedAt, resubscribedAt, preferences, tier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newEmail.toLowerCase(),
      updatedFirstName,
      updatedLastName,
      subscriber.subscribedAt,
      subscriber.unsubscribed,
      subscriber.unsubscribedAt || "",
      subscriber.resubscribedAt || "",
      updatedPreference,
      updatedTier
    ).run();

    await env.SITE_DB.prepare(
      "DELETE FROM subscribers WHERE email = ?"
    ).bind(oldEmail).run();
  } else if (changes.length > 0) {
    // Update in place
    await env.SITE_DB.prepare(
      "UPDATE subscribers SET firstName = ?, lastName = ?, tier = ?, preferences = ? WHERE email = ?"
    ).bind(updatedFirstName, updatedLastName, updatedTier, updatedPreference, oldEmail).run();
  }

  if (changes.length === 0) {
    return Response.json({ success: true, message: "No changes made." });
  }

  const finalEmail = (newEmail && newEmail.toLowerCase() !== oldEmail.toLowerCase()) ? newEmail.toLowerCase() : oldEmail;
  const updated = await env.SITE_DB.prepare(
    "SELECT * FROM subscribers WHERE email = ?"
  ).bind(finalEmail).first();

  return Response.json({
    success: true,
    message: `Subscriber updated: ${changes.join(", ")}`,
    subscriber: updated,
  });
}
