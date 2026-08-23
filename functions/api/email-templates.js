// Admin management of the system emails (Guru → Newsletter → System emails).
//
// GET    /api/email-templates            — every template, merged with overrides
// PUT    /api/email-templates            — { key, subject, html } save an override
// DELETE /api/email-templates            — { key } remove the override (restore default)

import { requireAdminStrict } from "../lib/auth.js";
import { EMAIL_TEMPLATES, getTemplate } from "../lib/email-templates.js";

export async function onRequestGet(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env } = context;
  const templates = [];
  for (const [key, def] of Object.entries(EMAIL_TEMPLATES)) {
    const current = await getTemplate(env, key);
    templates.push({
      key,
      label: def.label,
      description: def.description,
      vars: def.vars,
      subject: current.subject,
      html: current.html,
      overridden: current.overridden,
      default_subject: def.subject,
      default_html: def.html,
    });
  }
  return Response.json({ templates });
}

export async function onRequestPut(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { key, subject, html } = await request.json();

  if (!(key in EMAIL_TEMPLATES)) {
    return Response.json({ error: "Unknown template" }, { status: 400 });
  }
  if (!String(subject || "").trim() || !String(html || "").trim()) {
    return Response.json({ error: "Subject and HTML are both required" }, { status: 400 });
  }

  await env.SITE_DB.prepare(
    `INSERT INTO email_templates (key, subject, html, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET subject = excluded.subject,
       html = excluded.html, updated_at = excluded.updated_at`
  )
    .bind(key, String(subject).slice(0, 300), String(html).slice(0, 50000), new Date().toISOString())
    .run();

  return Response.json({ ok: true });
}

export async function onRequestDelete(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { key } = await request.json();
  if (!(key in EMAIL_TEMPLATES)) {
    return Response.json({ error: "Unknown template" }, { status: 400 });
  }

  await env.SITE_DB.prepare("DELETE FROM email_templates WHERE key = ?").bind(key).run();
  return Response.json({ ok: true, restored: true });
}
