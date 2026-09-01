// System emails — the transactional messages members and subscribers
// receive. Each has a coded default here; a row in `email_templates`
// (edited from Guru → Newsletter → System emails) overrides it, and
// deleting the row restores the default.
//
// Placeholders are written {{name}} and are replaced by render(). Values
// are HTML-escaped on the way in, so an edited template can't be broken
// (or abused) by what a member typed as their name.

const WRAP_OPEN =
  '<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#3f265b;">';
const BTN =
  'style="background:#3f265b;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;"';
const MUTED = 'style="color:#6b5b7d;font-size:14px;"';

export const EMAIL_TEMPLATES = {
  "member-welcome": {
    label: "Collective — welcome (after payment)",
    description:
      "Sent when someone joins the Collective through Stripe. Contains their first sign-in link.",
    vars: ["greeting_name", "link", "expires_in", "dues_note", "site"],
    subject: "Welcome to the Montessori Adolescent Collective",
    html: `${WRAP_OPEN}
      <p>Welcome{{greeting_name}} — you're in.</p>
      <p>The Montessori Adolescent Collective is a collaborative online community
      for all things third plane of development. Use the link below to sign in
      and set up your profile.</p>
      <p style="margin:28px 0;"><a href="{{link}}" ${BTN}>Sign in to the Collective</a></p>
      <p ${MUTED}>This link works once and expires in {{expires_in}}.
      You can always request a fresh one at {{site}}/collective/login/.</p>
      {{dues_note}}
      <p ${MUTED}>Please take a moment to read our
      <a href="{{site}}/collective/guidelines/">community guidelines</a> before posting.</p>
    </div>`,
  },

  "member-login-link": {
    label: "Collective — sign-in link",
    description: "Sent when a member requests a magic sign-in link.",
    vars: ["greeting_name", "link", "expires_in"],
    subject: "Your sign-in link for the Collective",
    html: `${WRAP_OPEN}
      <p>Hello{{greeting_name}},</p>
      <p>Here is your sign-in link for the Montessori Adolescent Collective:</p>
      <p style="margin:28px 0;"><a href="{{link}}" ${BTN}>Sign in to the Collective</a></p>
      <p ${MUTED}>This link works once and expires in {{expires_in}}.
      If you didn't ask to sign in, you can safely ignore this email.</p>
    </div>`,
  },

  "member-comped-welcome": {
    label: "Collective — welcome (comped member)",
    description:
      "Sent when an organiser adds someone by hand from Guru → Collective. Explains what the Collective is, that their membership is a gift with no dues, and carries their first sign-in link.",
    vars: ["greeting_name", "link", "expires_in", "site"],
    subject: "You have a place in the Montessori Adolescent Collective",
    html: `${WRAP_OPEN}
      <p>Hello{{greeting_name}},</p>
      <p>You have been given a place in the <strong>Montessori Adolescent
      Collective</strong>, a collaborative online community connecting Third
      Plane practitioners worldwide.</p>
      <p>Inside you will find a board for asking questions and sharing work,
      monthly gatherings, a shared library of documents and photographs, and a
      directory of practitioners open to exchanges and pen pal programmes.</p>
      <p><strong>Your membership is a gift.</strong> There are no dues to pay,
      nothing to set up, and nothing that will expire. Use the link below to
      sign in and set up your profile.</p>
      <p style="margin:28px 0;"><a href="{{link}}" ${BTN}>Sign in to the Collective</a></p>
      <p ${MUTED}>This link works once and expires in {{expires_in}}.
      You can always request a fresh one at {{site}}/collective/login/. There are
      no passwords: we email you a link each time, or you can set a password once
      you are inside.</p>
      <p ${MUTED}>Please take a moment to read our
      <a href="{{site}}/collective/guidelines/">community guidelines</a> before
      posting. They are short, and everyone agrees to them on the way in.</p>
    </div>`,
  },

  "member-new-message": {
    label: "Collective — new direct message",
    description:
      "Sent when a member receives a direct message. Only sent for a new conversation, or when they had already read everything before it — a back-and-forth doesn't email every line.",
    vars: ["greeting_name", "sender_name", "excerpt", "link", "site"],
    subject: "{{sender_name}} sent you a message",
    html: `${WRAP_OPEN}
      <p>Hello{{greeting_name}},</p>
      <p><strong>{{sender_name}}</strong> sent you a message in the Collective:</p>
      <p style="border-left:3px solid #d0905b;padding-left:14px;color:#5c4a3a;">{{excerpt}}</p>
      <p style="margin:28px 0;"><a href="{{link}}" ${BTN}>Read and reply</a></p>
      <p ${MUTED}>Replies happen in the Collective, not by email — this address
      isn't monitored for conversations between members.</p>
    </div>`,
  },

  "member-login-suspended": {
    label: "Collective — sign-in refused (membership paused)",
    description:
      "Sent instead of a sign-in link when the membership is suspended.",
    vars: [],
    subject: "About your Collective membership",
    html: `${WRAP_OPEN}
      <p>Your membership in the Montessori Adolescent Collective is currently paused,
      so we weren't able to send a sign-in link.</p>
      <p>If you think this is a mistake, please reply to this email and we'll sort it out.</p>
    </div>`,
  },

  "member-login-not-member": {
    label: "Collective — sign-in requested by a non-member",
    description:
      "Sent when someone who isn't a member asks for a sign-in link, so a typo doesn't leave them waiting forever.",
    vars: ["site"],
    subject: "Joining the Montessori Adolescent Collective",
    html: `${WRAP_OPEN}
      <p>Someone (hopefully you) asked for a sign-in link for the Montessori
      Adolescent Collective using this address, but it isn't a member yet.</p>
      <p style="margin:28px 0;"><a href="{{site}}/collective/" ${BTN}>See what the Collective is</a></p>
      <p ${MUTED}>If you joined with a different email address,
      try requesting a link with that one instead.</p>
    </div>`,
  },

  "admin-login-link": {
    label: "Collective — sign-in link sent by an admin",
    description:
      'Sent when an admin clicks "Send login link" in Guru for a member.',
    vars: ["greeting_name", "link", "expires_in", "site"],
    subject: "Your sign-in link for the Collective",
    html: `${WRAP_OPEN}
      <p>Hello{{greeting_name}} — here's a fresh sign-in link:</p>
      <p style="margin:28px 0;"><a href="{{link}}" ${BTN}>Sign in to the Collective</a></p>
      <p ${MUTED}>This link works once and expires in {{expires_in}}.
      You can always request another at {{site}}/collective/login/</p>
    </div>`,
  },

  "subscriber-welcome": {
    label: "Newsletter — welcome",
    description:
      "Sent when someone subscribes (or re-subscribes) to the newsletter. {{welcome_word}} is \"Welcome\" or \"Welcome back\".",
    vars: ["welcome_word", "first_name", "unsub_url", "site"],
    subject: "Welcome to Montessori for Adolescents",
    html: `<!DOCTYPE html><html><body style="font-family: Georgia, serif; color: #3E312A; background: #FAF7F2; padding: 40px 20px; margin: 0;">
<div style="max-width: 560px; margin: 0 auto;">
  <h1 style="color: #3E312A; font-size: 24px; margin-bottom: 16px;">{{welcome_word}}, {{first_name}}!</h1>
  <p style="line-height: 1.7; color: #5A4D42;">Thank you for subscribing to our newsletter. We'll share reflections, resources, and updates about bringing Montessori education to adolescents.</p>
  <p style="line-height: 1.7; color: #5A4D42;">In the meantime, visit our <a href="{{site}}/blog/" style="color: #B8755D;">blog</a> for the latest posts.</p>
  <p style="line-height: 1.7; color: #5A4D42;">Warmly,<br>The Montessori for Adolescents Team</p>
  <hr style="border: none; border-top: 1px solid #E8E0D8; margin: 32px 0 16px;">
  <p style="font-size: 12px; color: #9B8E82;"><a href="{{unsub_url}}" style="color: #9B8E82;">Unsubscribe</a></p>
</div></body></html>`,
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// Fetch the template for `key`: the D1 override if one exists, else the
// coded default. Never throws — email must not break sign-in.
export async function getTemplate(env, key) {
  const def = EMAIL_TEMPLATES[key];
  if (!def) throw new Error(`Unknown email template: ${key}`);
  try {
    const row = await env.SITE_DB.prepare(
      "SELECT subject, html FROM email_templates WHERE key = ?"
    )
      .bind(key)
      .first();
    if (row?.subject && row?.html) {
      return { subject: row.subject, html: row.html, overridden: true };
    }
  } catch {
    // Table missing or unreadable: fall through to the default.
  }
  return { subject: def.subject, html: def.html, overridden: false };
}

// Replace {{placeholders}}. Values are escaped; a value under `htmlVars`
// (e.g. a pre-built dues paragraph) is inserted as-is.
export function renderTemplate(tpl, vars = {}, htmlVars = {}) {
  const sub = (s) =>
    s.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, name) => {
      if (name in htmlVars) return String(htmlVars[name] ?? "");
      if (name in vars) return escapeHtml(String(vars[name] ?? ""));
      return "";
    });
  return { subject: sub(tpl.subject), html: sub(tpl.html) };
}

// Convenience: " Jarin" (leading space) or "" — for "Hello{{greeting_name}},"
export function greetingName(name) {
  return name ? ` ${name}` : "";
}
