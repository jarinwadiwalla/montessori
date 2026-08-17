// Admin-only member management for the Collective.
// Uses the same X-Admin-Token guard as the rest of the Guru area.
//
// GET    /api/community/admin-members            — list members + open reports
// PUT    /api/community/admin-members            — suspend / reactivate / make admin
// POST   /api/community/admin-members            — grant membership by hand
//        (safety net for a payment that didn't register)

import { requireAdminStrict } from "../../lib/auth.js";
import { generateId, normalizeEmail, isValidEmail } from "../../lib/community-auth.js";
import { ensureSubscriber } from "../../lib/community-list.js";
import { ensureHandle } from "../../lib/community-mentions.js";

export async function onRequestGet(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env } = context;

  const { results: members } = await env.SITE_DB.prepare(
    `SELECT id, email, name, role, status, joined_at, last_seen_at, amount_paid
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

  if (!id || !["suspend", "reactivate", "make_admin", "make_member"].includes(action)) {
    return Response.json({ error: "id and a valid action are required" }, { status: 400 });
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

  return Response.json({ ok: true, created: true });
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
