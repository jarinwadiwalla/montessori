import { requireAdmin } from "../lib/auth.js";

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

// GET: list pending retries
export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env } = context;
  const { results } = await env.SITE_DB.prepare(
    "SELECT * FROM retry_queue WHERE status = 'pending' ORDER BY createdAt DESC"
  ).all();

  const retries = results.map((r) => ({
    ...r,
    failedRecipients: JSON.parse(r.failedRecipients || "[]"),
  }));

  return Response.json({ retries });
}

// POST: process retry queue
export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  let retryId = null;

  try {
    const body = await request.json();
    retryId = body.retryId;
  } catch {
    // No body = process all pending
  }

  if (!env.RESEND_API_KEY) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  let retries;
  if (retryId) {
    const row = await env.SITE_DB.prepare(
      "SELECT * FROM retry_queue WHERE id = ? AND status = 'pending'"
    ).bind(retryId).first();
    retries = row ? [row] : [];
  } else {
    const { results } = await env.SITE_DB.prepare(
      "SELECT * FROM retry_queue WHERE status = 'pending' ORDER BY createdAt ASC"
    ).all();
    retries = results;
  }

  if (retries.length === 0) {
    return Response.json({ success: true, message: "No pending retries.", processed: 0, sent: 0 });
  }

  let totalProcessed = 0;
  let totalSent = 0;
  let stillPending = 0;

  for (const retry of retries) {
    const failedRecipients = JSON.parse(retry.failedRecipients || "[]");
    const plainText = retry.textBody || htmlToPlainText(retry.htmlBody);
    const errors = [];
    let sent = 0;
    const newEmailIds = [];
    const stillFailing = [];

    for (let i = 0; i < failedRecipients.length; i += SEND_BATCH_SIZE) {
      if (i > 0) await new Promise((r) => setTimeout(r, SEND_BATCH_DELAY_MS));
      const batch = failedRecipients.slice(i, i + SEND_BATCH_SIZE);

      const emails = [];
      for (const r of batch) {
        let personalizedHtml = retry.htmlBody;
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
          subject: retry.subject,
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
          sent += batch.length;
          if (data.data) {
            for (const item of data.data) {
              if (item.id) newEmailIds.push(item.id);
            }
          }
        } else {
          errors.push(`Batch ${Math.floor(i / SEND_BATCH_SIZE) + 1}: ${res.status}`);
          stillFailing.push(...batch);
        }
      } catch (err) {
        errors.push(`Batch ${Math.floor(i / SEND_BATCH_SIZE) + 1}: ${err.message}`);
        stillFailing.push(...batch);
      }
    }

    // Update retry record
    const now = new Date().toISOString();
    if (stillFailing.length === 0) {
      await env.SITE_DB.prepare(
        "UPDATE retry_queue SET status = 'completed', retryCount = retryCount + 1, updatedAt = ? WHERE id = ?"
      ).bind(now, retry.id).run();
    } else {
      stillPending++;
      await env.SITE_DB.prepare(
        "UPDATE retry_queue SET failedRecipients = ?, retryCount = retryCount + 1, updatedAt = ? WHERE id = ?"
      ).bind(JSON.stringify(stillFailing), now, retry.id).run();
    }

    // Update campaign with new email IDs
    if (retry.campaignId && newEmailIds.length > 0) {
      const campaign = await env.SITE_DB.prepare(
        "SELECT emailIds FROM campaigns WHERE id = ?"
      ).bind(retry.campaignId).first();

      if (campaign) {
        const existingIds = JSON.parse(campaign.emailIds || "[]");
        const allIds = [...existingIds, ...newEmailIds];
        await env.SITE_DB.prepare(
          "UPDATE campaigns SET emailIds = ?, totalSent = totalSent + ? WHERE id = ?"
        ).bind(JSON.stringify(allIds), sent, retry.campaignId).run();
      }
    }

    totalProcessed++;
    totalSent += sent;
  }

  return Response.json({
    success: true,
    message: `Processed ${totalProcessed} retry record(s). Sent ${totalSent} emails.`,
    processed: totalProcessed,
    sent: totalSent,
    stillPending,
  });
}
