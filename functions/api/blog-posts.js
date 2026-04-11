import { requireAdmin } from "../lib/auth.js";

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === "true") value = true;
    if (value === "false") value = false;
    meta[key] = value;
  }

  return { meta, body: match[2].trim() };
}

export async function onRequestGet(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return Response.json(
      { error: "GitHub configuration missing" },
      { status: 500 }
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "montessori-guru",
  };

  if (slug) {
    // Fetch single post
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/src/content/blog/${slug}.md`;
    const res = await fetch(apiUrl, { headers });
    if (!res.ok) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }
    const file = await res.json();
    const content = atob(file.content.replace(/\n/g, ""));
    const decoded = new TextDecoder().decode(
      Uint8Array.from(content, (c) => c.charCodeAt(0))
    );
    const { meta, body } = parseFrontmatter(decoded);
    return Response.json({ post: { slug, ...meta, body, sha: file.sha } });
  }

  // List all posts
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/src/content/blog`;
  const res = await fetch(apiUrl, { headers });
  if (!res.ok) {
    return Response.json({ posts: [] });
  }
  const files = await res.json();
  const mdFiles = files.filter((f) => f.name.endsWith(".md"));

  const posts = [];
  for (const file of mdFiles) {
    const fileRes = await fetch(file.url, { headers });
    if (!fileRes.ok) continue;
    const fileData = await fileRes.json();
    const content = atob(fileData.content.replace(/\n/g, ""));
    const decoded = new TextDecoder().decode(
      Uint8Array.from(content, (c) => c.charCodeAt(0))
    );
    const { meta } = parseFrontmatter(decoded);
    const fileSlug = file.name.replace(/\.md$/, "");
    posts.push({ slug: fileSlug, ...meta, sha: fileData.sha });
  }

  posts.sort((a, b) => {
    const dateA = a.publishDate || a.date || "";
    const dateB = b.publishDate || b.date || "";
    return dateB.localeCompare(dateA);
  });

  return Response.json({ posts });
}

export async function onRequestDelete(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const { slug } = await request.json();

  if (!slug) {
    return Response.json({ error: "slug is required" }, { status: 400 });
  }

  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "montessori-guru",
    "Content-Type": "application/json",
  };

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/src/content/blog/${slug}.md`;

  // Get SHA first
  const checkRes = await fetch(apiUrl, { headers });
  if (!checkRes.ok) {
    return Response.json({ error: "Post not found" }, { status: 404 });
  }
  const existing = await checkRes.json();

  const deleteRes = await fetch(apiUrl, {
    method: "DELETE",
    headers,
    body: JSON.stringify({
      message: `Delete blog post: ${slug}`,
      sha: existing.sha,
      branch: "main",
    }),
  });

  if (!deleteRes.ok) {
    const err = await deleteRes.text();
    return Response.json({ error: `GitHub API error: ${deleteRes.status}`, details: err }, { status: 502 });
  }

  return Response.json({ ok: true });
}
