// Admin-only member management for the Collective.
// Uses the same X-Admin-Token guard as the rest of the Guru area.
//
// GET    /api/community/admin-members            — list members + open reports
// PUT    /api/community/admin-members            — suspend / reactivate / make admin
// POST   /api/community/admin-members            — grant membership by hand
//        (safety net for a payment that didn't register)

import { requireAdminStrict } from "../../lib/auth.js";
import {
  generateId,
  normalizeEmail,
  isValidEmail,
  createLoginToken,
} from "../../lib/community-auth.js";
import { ensureSubscriber } from "../../lib/community-list.js";
import { ensureHandle } from "../../lib/community-mentions.js";
import { getTemplate, renderTemplate, greetingName } from "../../lib/email-templates.js";

export async function onRequestGet(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env } = context;

  const { results: members } = await env.SITE_DB.prepare(
    `SELECT id, email, name, role, status, joined_at, last_seen_at, amount_paid,
            location, plan, subscription_status, current_period_end,
            (subscription_id = '') AS comped
     FROM community_members ORDER BY joined_at DESC`
  ).all();

  const { results: reports } = await env.SITE_DB.prepare(
    `SELECT r.*, m.name AS reporter_name
     FROM community_reports r
     LEFT JOIN community_members m ON m.id = r.reporter_id
     WHERE r.status = 'open'
     ORDER BY r.created_at DESC
     LIMIT 100`
  ).all();

  return Response.json({ members, reports });
}

export async function onRequestPut(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { id, action } = await request.json();

  if (
    !id ||
    !["suspend", "reactivate", "make_admin", "make_member", "send_login_link"].includes(action)
  ) {
    return Response.json({ error: "id and a valid action are required" }, { status: 400 });
  }

  if (action === "send_login_link") {
    return sendLoginLink(context, id);
  }

  if (action === "suspend") {
    await env.SITE_DB.prepare(
      "UPDATE community_members SET status = 'suspended' WHERE id = ?"
    ).bind(id).run();
    // Sign them out everywhere immediately.
    await env.SITE_DB.prepare("DELETE FROM community_sessions WHERE member_id = ?")
      .bind(id).run();
  } else if (action === "reactivate") {
    await env.SITE_DB.prepare(
      "UPDATE community_members SET status = 'active' WHERE id = ?"
    ).bind(id).run();
  } else {
    await env.SITE_DB.prepare("UPDATE community_members SET role = ? WHERE id = ?")
      .bind(action === "make_admin" ? "admin" : "member", id)
      .run();
  }

  return Response.json({ ok: true });
}

export async function onRequestPost(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const body = await request.json();
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").slice(0, 60);

  if (!isValidEmail(email)) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }

  const existing = await env.SITE_DB.prepare(
    "SELECT id FROM community_members WHERE email = ?"
  ).bind(email).first();

  if (existing) {
    await env.SITE_DB.prepare(
      "UPDATE community_members SET status = 'active' WHERE id = ?"
    ).bind(existing.id).run();
    return Response.json({ ok: true, reactivated: true });
  }

  await env.SITE_DB.prepare(
    `INSERT INTO community_members
       (id, email, name, avatar_url, bio, role, status, joined_at, stripe_session_id, amount_paid)
     VALUES (?, ?, ?, '', '', 'member', 'active', ?, 'manual', 0)`
  ).bind(generateId("mem_"), email, name, new Date().toISOString()).run();

  await ensureSubscriber(env, email, name);

  if (name) {
    const row = await env.SITE_DB.prepare(
      "SELECT id FROM community_members WHERE email = ?"
    ).bind(email).first();
    if (row) await ensureHandle(env, row.id, name);
  }

  // Tell them. Adding someone by hand used to be silent: they had access
  // and no way to know it, and an admin had to remember a second click to
  // send a bare sign-in link that explained nothing.
  const emailed = await sendCompedWelcome(context, email, name);

  return Response.json({ ok: true, created: true, emailed });
}

/**
 * Welcome for a member added by hand. Mirrors the paid welcome, minus the
 * dues, and says plainly that the membership is a gift so an unexpected
 * sign-in link doesn't read as phishing.
 *
 * Returns whether it went, rather than throwing: the member has been
 * created either way, and losing that to a mail failure would be worse
 * than an admin having to resend.
 */
async function sendCompedWelcome(context, email, name) {
  const { env } = context;
  if (!env.RESEND_API_KEY) return false;

  try {
    const { token, expiresMinutes } = await createLoginToken(env, email, "admin");
    const site = "https://montessoriforadolescents.com";

    const tpl = renderTemplate(await getTemplate(env, "member-comped-welcome"), {
      greeting_name: greetingName(name),
      link: `${site}/collective/verify/?token=${encodeURIComponent(token)}`,
      expires_minutes: expiresMinutes,
      site,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "The Montessori Adolescent Collective <newsletter@montessoriforadolescents.com>",
        to: [email],
        subject: tpl.subject,
        html: tpl.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Email a member a fresh one-time sign-in link, on an admin's say-so.
// Handy when someone is stuck — no password set, magic-link email lost.
async function sendLoginLink(context, id) {
  const { env } = context;

  const member = await env.SITE_DB.prepare(
    "SELECT id, email, name, status FROM community_members WHERE id = ?"
  ).bind(id).first();

  if (!member) {
    return Response.json({ error: "No such member" }, { status: 404 });
  }
  if (member.status !== "active") {
    return Response.json({ error: "That member is suspended" }, { status: 400 });
  }
  if (!env.RESEND_API_KEY) {
    return Response.json({ error: "Email is not configured" }, { status: 503 });
  }

  const { token, expiresMinutes } = await createLoginToken(env, member.email, "admin");
  const link = `https://montessoriforadolescents.com/collective/verify/?token=${encodeURIComponent(token)}`;

  const tpl = renderTemplate(await getTemplate(env, "admin-login-link"), {
    greeting_name: greetingName(member.name),
    link,
    expires_minutes: expiresMinutes,
    site: "https://montessoriforadolescents.com",
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "The Montessori Adolescent Collective <newsletter@montessoriforadolescents.com>",
      to: [member.email],
      subject: tpl.subject,
      html: tpl.html,
    }),
  });

  if (!res.ok) {
    return Response.json({ error: "The email could not be sent" }, { status: 502 });
  }

  return Response.json({ ok: true, sent: true });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// Resolve a report once you've dealt with it.
export async function onRequestDelete(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { report_id } = await request.json();
  if (!report_id) {
    return Response.json({ error: "report_id is required" }, { status: 400 });
  }

  await env.SITE_DB.prepare(
    "UPDATE community_reports SET status = 'resolved' WHERE id = ?"
  ).bind(report_id).run();

  return Response.json({ ok: true });
}
