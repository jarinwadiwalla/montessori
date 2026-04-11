export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return new Response("Missing slug parameter", { status: 400 });
  }

  const row = await env.SITE_DB.prepare(
    "SELECT * FROM blog_drafts WHERE slug = ?"
  ).bind(slug).first();

  if (!row) {
    return new Response("Draft not found", { status: 404 });
  }

  const draft = row;
  const html = renderPreview(draft);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function mdToHtml(md) {
  if (!md) return "";

  // Escape HTML entities first
  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;
  let blankBuffer = [];

  const flushList = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };
  const flushBlockquote = () => {
    if (inBlockquote) { out.push("</blockquote>"); inBlockquote = false; }
  };

  const inline = (s) => s
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin-block:1rem;">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      blankBuffer.push("");
      continue;
    }

    if (blankBuffer.length > 0) {
      flushList();
      flushBlockquote();
      blankBuffer = [];
    }

    if (/^#{1,6}\s/.test(line)) {
      flushList();
      const level = line.match(/^(#+)/)[1].length;
      const text = line.replace(/^#+\s/, "");
      out.push(`<h${level}>${inline(escape(text))}</h${level}>`);
    } else if (/^---+$/.test(line.trim())) {
      flushList();
      out.push("<hr>");
    } else if (/^>\s?/.test(line)) {
      if (!inBlockquote) { out.push("<blockquote>"); inBlockquote = true; }
      out.push(`<p>${inline(escape(line.replace(/^>\s?/, "")))}</p>`);
    } else if (/^\d+\.\s/.test(line)) {
      if (!inOl) { flushList(); out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(escape(line.replace(/^\d+\.\s/, "")))}</li>`);
    } else if (/^[-*]\s/.test(line)) {
      if (!inUl) { flushList(); out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(escape(line.replace(/^[-*]\s/, "")))}</li>`);
    } else {
      flushList();
      flushBlockquote();
      out.push(`<p>${inline(escape(line))}</p>`);
    }
  }

  flushList();
  flushBlockquote();
  return out.join("\n");
}

function renderPreview(draft) {
  const title = draft.title || "Untitled Draft";
  const author = draft.author || "";
  const date = draft.date
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" })
        .format(new Date(draft.date))
    : "";
  const body = mdToHtml(draft.body || "");
  const coverImage = draft.image
    ? `<img src="${draft.image}" alt="${title}" style="width:100%;max-height:400px;object-fit:cover;border-radius:8px;margin-bottom:2rem;">`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preview: ${title}</title>
  <style>
    @font-face { font-family:'Lora'; src:url('/fonts/Lora-Regular.woff2') format('woff2'); font-weight:400; font-display:swap; }
    @font-face { font-family:'Lora'; src:url('/fonts/Lora-SemiBold.woff2') format('woff2'); font-weight:600; font-display:swap; }
    @font-face { font-family:'Lora'; src:url('/fonts/Lora-Italic.woff2') format('woff2'); font-weight:400; font-style:italic; font-display:swap; }
    @font-face { font-family:'Inter'; src:url('/fonts/Inter-Regular.woff2') format('woff2'); font-weight:400; font-display:swap; }
    @font-face { font-family:'Inter'; src:url('/fonts/Inter-SemiBold.woff2') format('woff2'); font-weight:600; font-display:swap; }

    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

    :root {
      --color-cream:#FAF7F2;
      --color-terracotta:#B8755D;
      --color-terracotta-dark:#9A5F4A;
      --color-sage:#7A8B6F;
      --color-earth:#5C4A3A;
      --color-text:#4A3F35;
      --color-text-light:#7D6B5D;
      --color-border:#E5DFD7;
      --font-heading:'Lora',Georgia,serif;
      --font-body:'Inter',-apple-system,sans-serif;
    }

    body {
      font-family:var(--font-body);
      font-size:1rem;
      line-height:1.6;
      color:var(--color-text);
      background:var(--color-cream);
      padding:2rem 1rem 6rem;
      -webkit-font-smoothing:antialiased;
    }

    .preview-banner {
      position:fixed;
      top:0; left:0; right:0;
      background:#7c6af7;
      color:#fff;
      text-align:center;
      padding:0.5rem 1rem;
      font-size:0.8rem;
      font-weight:600;
      letter-spacing:0.05em;
      z-index:100;
    }

    article {
      max-width:680px;
      margin:3rem auto 0;
      padding-top:1rem;
    }

    h1.post-title {
      font-family:var(--font-heading);
      font-size:2.25rem;
      color:var(--color-earth);
      line-height:1.2;
      margin-bottom:1rem;
    }

    .post-meta {
      font-size:0.875rem;
      color:var(--color-text-light);
      margin-bottom:2.5rem;
      display:flex;
      gap:0.5rem;
      align-items:center;
    }

    .post-meta .sep::before { content:'·'; }

    .post-content { line-height:1.8; }

    .post-content p { margin-bottom:1.5rem; }

    .post-content h2 {
      font-family:var(--font-heading);
      font-size:1.5rem;
      color:var(--color-earth);
      margin-top:3rem;
      margin-bottom:1rem;
    }

    .post-content h3 {
      font-family:var(--font-heading);
      font-size:1.25rem;
      color:var(--color-earth);
      margin-top:2rem;
      margin-bottom:0.5rem;
    }

    .post-content h4, .post-content h5, .post-content h6 {
      font-family:var(--font-heading);
      color:var(--color-earth);
      margin-top:1.5rem;
      margin-bottom:0.5rem;
    }

    .post-content ul, .post-content ol {
      margin-bottom:1.5rem;
      padding-left:2rem;
    }

    .post-content li { margin-bottom:0.5rem; }

    .post-content blockquote {
      border-left:3px solid var(--color-terracotta);
      padding-left:1.5rem;
      margin-block:2rem;
      color:var(--color-text-light);
      font-style:italic;
    }

    .post-content blockquote p { margin-bottom:0; }

    .post-content code {
      background:#f0ebe3;
      border-radius:3px;
      padding:0.1em 0.3em;
      font-size:0.9em;
    }

    .post-content hr {
      border:none;
      border-top:1px solid var(--color-border);
      margin-block:2rem;
    }

    .post-content a { color:var(--color-terracotta); }
    .post-content a:hover { color:var(--color-terracotta-dark); }

    @media (max-width:768px) {
      h1.post-title { font-size:1.75rem; }
      article { margin-top:2.5rem; }
    }
  </style>
</head>
<body>
  <div class="preview-banner">DRAFT PREVIEW &mdash; not yet published</div>
  <article>
    ${coverImage}
    <h1 class="post-title">${title}</h1>
    <div class="post-meta">
      ${date ? `<span>${date}</span>` : ""}
      ${date && author ? `<span class="sep"></span>` : ""}
      ${author ? `<span>by ${author}</span>` : ""}
    </div>
    <div class="post-content">
      ${body || '<p style="color:#aaa;">No content yet.</p>'}
    </div>
  </article>
</body>
</html>`;
}
