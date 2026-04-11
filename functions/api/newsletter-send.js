import { requireAdmin } from "../lib/auth.js";

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
  const { subject, htmlBody, textBody, testEmails } = await request.json();

  if (!subject || !htmlBody) {
    return Response.json({ error: "subject and htmlBody are required" }, { status: 400 });
  }

  if (!env.RESEND_API_KEY) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  // Get recipients
  let recipients;
  const isTest = testEmails && testEmails.length > 0;

  if (isTest) {
    recipients = testEmails.map((e) => ({ email: e, firstName: "Test", lastName: "" }));
  } else {
    const { results } = await env.SITE_DB.prepare(
      "SELECT email, firstName, lastName FROM subscribers WHERE unsubscribed = 0"
    ).all();
    recipients = results;
  }

  if (recipients.length === 0) {
    return Response.json({ error: "No recipients found" }, { status: 400 });
  }

  const plainText = textBody || htmlToPlainText(htmlBody);
  const errors = [];
  let totalSent = 0;
  const emailIds = [];

  // Send in batches of 100
  for (let i = 0; i < recipients.length; i += 100) {
    const batch = recipients.slice(i, i + 100);

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

      // Append unsubscribe footer if not already present
      if (!personalizedHtml.includes("unsubscribe") && !personalizedHtml.includes("Unsubscribe")) {
        personalizedHtml += `<hr style="border: none; border-top: 1px solid #E8E0D8; margin: 32px 0 16px;"><p style="font-size: 12px; color: #9B8E82; text-align: center;"><a href="${unsubUrl}" style="color: #9B8E82;">Unsubscribe</a> from this newsletter.</p>`;
      }

      emails.push({
        from: "Montessori for Adolescents <newsletter@montessoriforadolescents.com>",
        to: [r.email],
        subject,
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
        errors.push(`Batch ${Math.floor(i / 100) + 1}: ${res.status} ${errText}`);
      }
    } catch (err) {
      errors.push(`Batch ${Math.floor(i / 100) + 1}: ${err.message}`);
    }
  }

  // Record campaign
  if (!isTest) {
    const campaignId = `campaign-${Date.now()}`;
    await env.SITE_DB.prepare(
      "INSERT INTO campaigns (id, subject, sentAt, totalSent, totalRecipients, status, errors) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      campaignId,
      subject,
      new Date().toISOString(),
      totalSent,
      recipients.length,
      errors.length > 0 ? "partial" : "sent",
      JSON.stringify(errors)
    ).run();
  }

  return Response.json({
    success: true,
    message: `Sent ${totalSent} of ${recipients.length} emails.`,
    totalSent,
    totalRecipients: recipients.length,
    errors: errors.length > 0 ? errors : undefined,
    isTest,
  });
}
