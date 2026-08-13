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

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { subject, htmlBody, textBody, testEmails, customEmails, tier, isAnnouncement } = await request.json();

  if (!subject || !htmlBody) {
    return Response.json({ error: "subject and htmlBody are required" }, { status: 400 });
  }

  if (!env.RESEND_API_KEY) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  // Determine recipients
  let recipients;
  const isTest = testEmails && testEmails.length > 0;
  const isCustom = !isTest && customEmails && customEmails.length > 0;
  let sendTier = "all";

  if (isTest) {
    recipients = testEmails.map((e) => ({ email: e, firstName: "Test", lastName: "" }));
    sendTier = "test";
  } else if (isCustom) {
    // Look up subscriber data for custom emails
    const placeholders = customEmails.map(() => "?").join(",");
    const { results } = await env.SITE_DB.prepare(
      `SELECT email, firstName, lastName FROM subscribers WHERE email IN (${placeholders})`
    ).bind(...customEmails.map((e) => e.toLowerCase())).all();

    const found = new Map(results.map((r) => [r.email.toLowerCase(), r]));
    recipients = customEmails.map((e) => found.get(e.toLowerCase()) || { email: e, firstName: "", lastName: "" });
    sendTier = "custom";
  } else {
    // Build query based on tier and preferences
    let query = "SELECT email, firstName, lastName, tier, preferences FROM subscribers WHERE unsubscribed = 0";
    const params = [];

    if (tier === "founding") {
      query += " AND tier = 'founding'";
      sendTier = "founding";
    } else if (tier === "donor") {
      query += " AND tier = 'donor'";
      sendTier = "donor";
    } else if (tier === "subscriber") {
      query += " AND (tier = 'subscriber' OR tier IS NULL)";
      sendTier = "subscriber";
    } else {
      // Donors are a separate list: they are reached only by choosing
      // "Donors Only", never by a general send.
      query += " AND (tier IS NULL OR tier != 'donor')";
      sendTier = "all";
    }

    const { results } = await env.SITE_DB.prepare(query).bind(...params).all();

    // Filter by preference (unless announcement)
    if (isAnnouncement) {
      // Announcements go to everyone, including founding members who unsubscribed
      if (tier === "founding" || !tier) {
        const { results: foundingUnsub } = await env.SITE_DB.prepare(
          "SELECT email, firstName, lastName, tier FROM subscribers WHERE unsubscribed = 1 AND tier = 'founding'"
        ).all();
        recipients = [...results, ...foundingUnsub];
      } else {
        recipients = results;
      }
    } else {
      // Regular sends respect preferences ('updates-only' opts out of regular sends)
      recipients = results.filter((r) => {
        const pref = r.preferences || "all";
        return pref !== "updates-only";
      });
    }
  }

  if (recipients.length === 0) {
    return Response.json({ error: "No recipients found" }, { status: 400 });
  }

  const plainText = textBody || htmlToPlainText(htmlBody);
  const errors = [];
  let totalSent = 0;
  const emailIds = [];
  const failedRecipients = [];
  const sentSubject = isTest ? `[TEST] ${subject}` : subject;

  // Send in batches
  for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, SEND_BATCH_DELAY_MS));
    const batch = recipients.slice(i, i + SEND_BATCH_SIZE);

    const emails = [];
    for (const r of batch) {
      let personalizedHtml = htmlBody;
      let personalizedText = plainText;

      // Replace template variables
      personalizedHtml = personalizedHtml
        .replace(/\{\{firstName\}\}/g, r.firstName || "")
        .replace(/\{\{lastName\}\}/g, r.lastName || "")
        .replace(/\{\{email\}\}/g, r.email);

      personalizedText = personalizedText
        .replace(/\{\{firstName\}\}/g, r.firstName || "")
        .replace(/\{\{lastName\}\}/g, r.lastName || "")
        .replace(/\{\{email\}\}/g, r.email);

      // Generate unsubscribe URL
      let unsubUrl = `https://montessoriforadolescents.com/api/unsubscribe?email=${encodeURIComponent(r.email)}`;
      if (env.UNSUBSCRIBE_SECRET) {
        const token = await hmacToken(r.email, env.UNSUBSCRIBE_SECRET);
        unsubUrl += `&token=${token}`;
      }

      personalizedHtml = personalizedHtml.replace(/\{\{unsubscribeUrl\}\}/g, unsubUrl);
      personalizedText = personalizedText.replace(/\{\{unsubscribeUrl\}\}/g, unsubUrl);

      // Generate preferences URL
      let prefsUrl = `https://montessoriforadolescents.com/api/preferences?email=${encodeURIComponent(r.email)}`;
      if (env.UNSUBSCRIBE_SECRET) {
        const token = await hmacToken(r.email, env.UNSUBSCRIBE_SECRET);
        prefsUrl += `&token=${token}`;
      }

      personalizedHtml = personalizedHtml.replace(/\{\{preferencesUrl\}\}/g, prefsUrl);
      personalizedText = personalizedText.replace(/\{\{preferencesUrl\}\}/g, prefsUrl);

      // Append unsubscribe footer if not already present
      if (!personalizedHtml.includes("unsubscribe") && !personalizedHtml.includes("Unsubscribe")) {
        personalizedHtml += `<hr style="border: none; border-top: 1px solid #E8E0D8; margin: 32px 0 16px;"><p style="font-size: 12px; color: #9B8E82; text-align: center;"><a href="${unsubUrl}" style="color: #9B8E82;">Unsubscribe</a> | <a href="${prefsUrl}" style="color: #9B8E82;">Email Preferences</a></p>`;
      }

      emails.push({
        from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
        to: [r.email],
        subject: sentSubject,
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
            if (item.id) emailIds.push(item.id);
          }
        }
      } else {
        const errText = await res.text();
        errors.push(`Batch ${Math.floor(i / SEND_BATCH_SIZE) + 1}: ${res.status} ${errText}`);
        failedRecipients.push(...batch);
      }
    } catch (err) {
      errors.push(`Batch ${Math.floor(i / SEND_BATCH_SIZE) + 1}: ${err.message}`);
      failedRecipients.push(...batch);
    }
  }

  // Record campaign
  if (!isTest) {
    const now = new Date().toISOString();
    const campaignId = `campaign-${Date.now()}`;
    const status = errors.length > 0 ? (totalSent === 0 ? "failed" : "partial") : "sent";

    await env.SITE_DB.prepare(
      `INSERT INTO campaigns (id, subject, sentAt, totalSent, totalRecipients, status, errors, emailIds, recipients, tier, failedCount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      campaignId,
      subject,
      now,
      totalSent,
      recipients.length,
      status,
      JSON.stringify(errors),
      JSON.stringify(emailIds),
      JSON.stringify(recipients.map((r) => ({ email: r.email, firstName: r.firstName, lastName: r.lastName }))),
      sendTier,
      failedRecipients.length
    ).run();

    // Queue failed recipients for retry
    if (failedRecipients.length > 0) {
      const retryId = `retry-${Date.now()}`;
      await env.SITE_DB.prepare(
        `INSERT INTO retry_queue (id, subject, htmlBody, textBody, failedRecipients, status, campaignId, retryCount, originalSentAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?)`
      ).bind(
        retryId,
        subject,
        htmlBody,
        plainText,
        JSON.stringify(failedRecipients.map((r) => ({ email: r.email, firstName: r.firstName, lastName: r.lastName }))),
        campaignId,
        now,
        now,
        now
      ).run();

      // Update campaign with retry key
      await env.SITE_DB.prepare(
        "UPDATE campaigns SET retryKey = ? WHERE id = ?"
      ).bind(retryId, campaignId).run();
    }
  }

  return Response.json({
    success: true,
    message: `Sent ${totalSent} of ${recipients.length} emails.`,
    totalSent,
    totalRecipients: recipients.length,
    failedCount: failedRecipients.length,
    errors: errors.length > 0 ? errors : undefined,
    isTest,
  });
}
