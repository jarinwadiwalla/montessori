// POST /api/community/report  { target_type, target_id, reason }
// Lets a member flag a post or comment for Jarin to review.

import { requireMember, generateId } from "../../lib/community-auth.js";

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const targetType = String(payload.target_type || "");
  const targetId = String(payload.target_id || "");
  const reason = String(payload.reason || "").trim().slice(0, 1000);

  if (!["post", "comment"].includes(targetType) || !targetId) {
    return Response.json({ error: "Invalid report." }, { status: 400 });
  }

  // One open report per member per item.
  const existing = await env.SITE_DB.prepare(
    `SELECT id FROM community_reports
     WHERE target_type = ? AND target_id = ? AND reporter_id = ? AND status = 'open'`
  )
    .bind(targetType, targetId, member.id)
    .first();

  if (existing) {
    return Response.json({ ok: true, message: "You've already reported this. Thank you." });
  }

  const now = new Date().toISOString();
  await env.SITE_DB.prepare(
    `INSERT INTO community_reports (id, target_type, target_id, reporter_id, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`
  )
    .bind(generateId("rep_"), targetType, targetId, member.id, reason, now)
    .run();

  if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
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
          subject: `Collective: a ${targetType} was reported`,
          html: `<p>A member reported a ${targetType} in the Collective.</p>
                 <p><strong>Reason given:</strong> ${escapeHtml(reason) || "(none)"}</p>
                 <p><a href="https://montessoriforadolescents.com/collective/portal/">Open the Collective</a></p>`,
        }),
      }).catch(() => {})
    );
  }

  return Response.json({ ok: true, message: "Thank you — we'll take a look." });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
