import { requireAdmin } from "../lib/auth.js";

const DELIVERED_EVENTS = new Set(["delivered", "opened", "clicked"]);
const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 1000;

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

function htmlToPlainText(html) {
  return html
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { campaignId, htmlBody } = await request.json();

  if (!campaignId) {
    return Response.json({ error: "campaignId is required" }, { status: 400 });
  }

  const campaign = await env.SITE_DB.prepare(
    "SELECT * FROM campaigns WHERE id = ?"
  ).bind(campaignId).first();

  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const emailIds = JSON.parse(campaign.emailIds || "[]");
  const recipients = JSON.parse(campaign.recipients || "[]");

  if (emailIds.length === 0) {
    return Response.json({ error: "No email IDs stored for this campaign" }, { status: 400 });
  }

  // Check delivery status for all email IDs
  const placeholders = emailIds.map(() => "?").join(",");
  const { results: storedEvents } = await env.SITE_DB.prepare(
    `SELECT emailId, last_event, email FROM resend_events WHERE emailId IN (${placeholders})`
  ).bind(...emailIds).all();

  const deliveredEmails = new Set();
  for (const evt of storedEvents) {
    if (DELIVERED_EVENTS.has(evt.last_event)) {
      deliveredEmails.add(evt.email.toLowerCase());
    }
  }

  // Check Resend API for IDs without webhook data
  const checkedIds = new Set(storedEvents.map((e) => e.emailId));
  const uncheckedIds = emailIds.filter((id) => !checkedIds.has(id));

  if (uncheckedIds.length > 0 && env.RESEND_API_KEY) {
    for (let i = 0; i < uncheckedIds.length; i += 2) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000));
      const batch = uncheckedIds.slice(i, i + 2);
      const results = await Promise.allSettled(
        batch.map(async (id) => {
          const res = await fetch(`https://api.resend.com/emails/${id}`, {
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
          });
          if (!res.ok) return null;
          return res.json();
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          const data = result.value;
          if (DELIVERED_EVENTS.has(data.last_event)) {
            const to = Array.isArray(data.to) ? data.to[0] : data.to;
            if (to) deliveredEmails.add(to.toLowerCase());
          }
        }
      }
    }
  }

  // Find undelivered recipients
  const undelivered = recipients.filter((r) => !deliveredEmails.has(r.email.toLowerCase()));
  const delivered = recipients.length - undelivered.length;

  // Dry run if no htmlBody provided
  if (!htmlBody) {
    return Response.json({
      success: true,
      dryRun: true,
      delivered,
      undelivered: undelivered.length,
      total: recipients.length,
      message: `${delivered} delivered, ${undelivered.length} need resending. Provide htmlBody to resend.`,
    });
  }

  if (undelivered.length === 0) {
    return Response.json({ success: true, message: "All emails were delivered. Nothing to resend." });
  }

  if (!env.RESEND_API_KEY) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  // Send to undelivered recipients
  const plainText = htmlToPlainText(htmlBody);
  const errors = [];
  let totalSent = 0;
  const newEmailIds = [];

  for (let i = 0; i < undelivered.length; i += SEND_BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, SEND_BATCH_DELAY_MS));
    const batch = undelivered.slice(i, i + SEND_BATCH_SIZE);

    const emails = [];
    for (const r of batch) {
      let personalizedHtml = htmlBody;
      let personalizedText = plainText;

      personalizedHtml = personalizedHtml
        .replace(/\{\{firstName\}\}/g, r.firstName || "")
        .replace(/\{\{lastName\}\}/g, r.lastName || "")
        .replace(/\{\{email\}\}/g, r.email);
      personalizedText = personalizedText
        .replace(/\{\{firstName\}\}/g, r.firstName || "")
        .replace(/\{\{lastName\}\}/g, r.lastName || "")
        .replace(/\{\{email\}\}/g, r.email);

      let unsubUrl = `https://montessoriforadolescents.com/api/unsubscribe?email=${encodeURIComponent(r.email)}`;
      if (env.UNSUBSCRIBE_SECRET) {
        const token = await hmacToken(r.email, env.UNSUBSCRIBE_SECRET);
        unsubUrl += `&token=${token}`;
      }
      personalizedHtml = personalizedHtml.replace(/\{\{unsubscribeUrl\}\}/g, unsubUrl);
      personalizedText = personalizedText.replace(/\{\{unsubscribeUrl\}\}/g, unsubUrl);

      let prefsUrl = `https://montessoriforadolescents.com/api/preferences?email=${encodeURIComponent(r.email)}`;
      if (env.UNSUBSCRIBE_SECRET) {
        const token = await hmacToken(r.email, env.UNSUBSCRIBE_SECRET);
        prefsUrl += `&token=${token}`;
      }
      personalizedHtml = personalizedHtml.replace(/\{\{preferencesUrl\}\}/g, prefsUrl);
      personalizedText = personalizedText.replace(/\{\{preferencesUrl\}\}/g, prefsUrl);

      if (!personalizedHtml.includes("unsubscribe") && !personalizedHtml.includes("Unsubscribe")) {
        personalizedHtml += `<hr style="border: none; border-top: 1px solid #E8E0D8; margin: 32px 0 16px;"><p style="font-size: 12px; color: #9B8E82; text-align: center;"><a href="${unsubUrl}" style="color: #9B8E82;">Unsubscribe</a> from this newsletter.</p>`;
      }

      emails.push({
        from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
        to: [r.email],
        subject: campaign.subject,
        html: personalizedHtml,
        text: personalizedText,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    }

    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emails),
      });

      if (res.ok) {
        const data = await res.json();
        totalSent += batch.length;
        if (data.data) {
          for (const item of data.data) {
            if (item.id) newEmailIds.push(item.id);
          }
        }
      } else {
        const errText = await res.text();
        errors.push(`Batch ${Math.floor(i / SEND_BATCH_SIZE) + 1}: ${res.status} ${errText}`);
      }
    } catch (err) {
      errors.push(`Batch ${Math.floor(i / SEND_BATCH_SIZE) + 1}: ${err.message}`);
    }
  }

  // Update campaign with new email IDs
  const allEmailIds = [...emailIds, ...newEmailIds];
  const now = new Date().toISOString();
  await env.SITE_DB.prepare(
    "UPDATE campaigns SET emailIds = ?, totalSent = totalSent + ?, statsCachedAt = ? WHERE id = ?"
  ).bind(JSON.stringify(allEmailIds), totalSent, now, campaignId).run();

  return Response.json({
    success: true,
    message: `Resent to ${totalSent} of ${undelivered.length} undelivered recipients.`,
    delivered,
    resent: totalSent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
