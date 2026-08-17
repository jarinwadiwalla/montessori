// @mentions in the Collective.
//
// Each member gets a handle derived from their display name, so
// "Jarin Wadiwalla" becomes @jarinwadiwalla. Typing that in a post or a
// comment emails the person mentioned.

const MAX_HANDLE = 30;
// Cap notifications per post so one message can't email the whole community.
const MAX_NOTIFIED = 10;
const SITE = "https://montessoriforadolescents.com";

export function slugifyHandle(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: Bertránd -> bertrand
    .replace(/[^a-z0-9]/g, "")
    .slice(0, MAX_HANDLE);
}

// Give a member a unique handle. Returns the handle, or "" if their name
// produces nothing usable (a name of only punctuation, say).
export async function ensureHandle(env, memberId, name) {
  const base = slugifyHandle(name);
  if (!base) return "";

  const current = await env.SITE_DB.prepare(
    "SELECT handle FROM community_members WHERE id = ?"
  )
    .bind(memberId)
    .first();

  // Already has one derived from this name — leave it alone, so links and
  // muscle memory don't break every time someone edits their bio.
  if (current?.handle && current.handle.replace(/\d+$/, "") === base) {
    return current.handle;
  }

  let candidate = base;
  for (let i = 2; i < 50; i++) {
    const taken = await env.SITE_DB.prepare(
      "SELECT id FROM community_members WHERE handle = ? AND id != ?"
    )
      .bind(candidate, memberId)
      .first();
    if (!taken) break;
    candidate = `${base}${i}`.slice(0, MAX_HANDLE);
  }

  await env.SITE_DB.prepare("UPDATE community_members SET handle = ? WHERE id = ?")
    .bind(candidate, memberId)
    .run();

  return candidate;
}

// Pull @handles out of a body of text. Ignores an @ inside an email address.
export function extractHandles(text) {
  const found = new Set();
  const re = /(^|[^\w@.])@([a-z0-9]{2,30})\b/gi;
  let m;
  while ((m = re.exec(String(text || "")))) {
    found.add(m[2].toLowerCase());
  }
  return [...found];
}

// Email everyone named in a post or comment. Never emails the author for
// mentioning themselves, and skips members whose dues have lapsed.
export async function notifyMentions(context, { text, author, kind, postId }) {
  const { env } = context;
  const handles = extractHandles(text);
  if (!handles.length) return [];

  const placeholders = handles.map(() => "?").join(",");
  const { results } = await env.SITE_DB.prepare(
    `SELECT id, email, name, handle FROM community_members
     WHERE handle IN (${placeholders}) AND status = 'active'`
  )
    .bind(...handles)
    .all();

  const targets = results.filter((m) => m.id !== author.id).slice(0, MAX_NOTIFIED);
  if (!targets.length) return [];

  const where = kind === "comment" ? "a comment" : "a post";
  const link = `${SITE}/collective/portal/`;
  const excerpt = String(text).trim().slice(0, 280);

  for (const target of targets) {
    if (!env.RESEND_API_KEY) break;
    context.waitUntil(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "The Montessori Adolescent Collective <newsletter@montessoriforadolescents.com>",
          to: [target.email],
          subject: `${author.name || "Someone"} mentioned you in the Collective`,
          html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#3f265b;">
              <p><strong>${escapeHtml(author.name || "Someone")}</strong> mentioned you in ${where}:</p>
              <blockquote style="margin:20px 0;padding:12px 18px;border-left:3px solid #d0905b;background:#faf7f3;color:#4a3f35;">
                ${escapeHtml(excerpt)}${String(text).length > 280 ? "…" : ""}
              </blockquote>
              <p style="margin:28px 0;">
                <a href="${link}" style="background:#3f265b;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">Read it in the Collective</a>
              </p>
              <p style="color:#6b5b7d;font-size:14px;">You're getting this because someone typed
              @${escapeHtml(target.handle)} in the Collective.</p>
            </div>`,
        }),
      }).catch(() => {})
    );
  }

  return targets.map((t) => t.handle);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
