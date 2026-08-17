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

// Record an in-app alert for everyone named in a post or comment.
//
// Deliberately not email: mentions in a busy thread would fill people's
// inboxes. These sit in the portal with an unread count instead, and the
// member clears them when they're ready.
//
// Nobody is notified for mentioning themselves, and suspended members are
// skipped.
export async function notifyMentions(context, { text, author, kind, postId }) {
  const { env } = context;
  const handles = extractHandles(text);
  if (!handles.length) return [];

  const placeholders = handles.map(() => "?").join(",");
  const { results } = await env.SITE_DB.prepare(
    `SELECT id, name, handle FROM community_members
     WHERE handle IN (${placeholders}) AND status = 'active'`
  )
    .bind(...handles)
    .all();

  const targets = results.filter((m) => m.id !== author.id).slice(0, MAX_NOTIFIED);
  if (!targets.length) return [];

  const now = new Date().toISOString();
  const excerpt = String(text).trim().slice(0, 240);

  for (const target of targets) {
    await env.SITE_DB.prepare(
      `INSERT INTO community_notifications
         (id, member_id, kind, actor_id, actor_name, post_id, excerpt, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`
    )
      .bind(
        generateNotificationId(),
        target.id,
        kind === "comment" ? "mention_comment" : "mention_post",
        author.id,
        author.name || "A member",
        postId || "",
        excerpt,
        now
      )
      .run();
  }

  return targets.map((t) => t.handle);
}

function generateNotificationId() {
  return `ntf_${Date.now().toString(36)}-${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 12)}`;
}
