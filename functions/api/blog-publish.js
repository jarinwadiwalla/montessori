import { requireAdmin } from "../lib/auth.js";

function buildMarkdown(draft) {
  const featured = draft.featured ? "true" : "false";
  const date = draft.date || new Date().toISOString().split("T")[0];

  return `---
title: "${draft.title.replace(/"/g, '\\"')}"
description: "${(draft.description || "").replace(/"/g, '\\"')}"
author: "${(draft.author || "Jarin Wadiwalla").replace(/"/g, '\\"')}"
publishDate: ${date}
featured: ${featured}
---

${draft.body || ""}
`;
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const { env, request } = context;
  const body = await request.json();
  const { slug } = body;

  if (!slug) {
    return Response.json({ error: "slug is required" }, { status: 400 });
  }

  // Accept inline draft to avoid D1 read consistency issues
  let draft = body.draft;
  if (!draft) {
    const row = await env.SITE_DB.prepare(
      "SELECT * FROM blog_drafts WHERE slug = ?"
    ).bind(slug).first();
    if (!row) {
      return Response.json({ error: "Draft not found" }, { status: 404 });
    }
    draft = row;
  }

  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return Response.json(
      { error: "GitHub configuration missing (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)" },
      { status: 500 }
    );
  }

  const filePath = `src/content/blog/${slug}.md`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "montessori-guru",
  };

  // Check if file already exists (to get SHA for update)
  let existingSha = null;
  const checkRes = await fetch(apiUrl, { headers });
  if (checkRes.ok) {
    const existing = await checkRes.json();
    existingSha = existing.sha;
  }

  const markdownContent = buildMarkdown(draft);
  const commitBody = {
    message: `${existingSha ? "Update" : "Add"} blog post: ${draft.title}`,
    content: utf8ToBase64(markdownContent),
    branch: "main",
  };
  if (existingSha) {
    commitBody.sha = existingSha;
  }

  const commitRes = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(commitBody),
  });

  if (!commitRes.ok) {
    const err = await commitRes.text();
    return Response.json(
      { error: `GitHub API error: ${commitRes.status}`, details: err },
      { status: 502 }
    );
  }

  // Delete draft from D1 after successful publish
  await env.SITE_DB.prepare("DELETE FROM blog_drafts WHERE slug = ?").bind(slug).run();

  return Response.json({
    ok: true,
    message: `${existingSha ? "Updated" : "Published"} blog post: ${draft.title}`,
    file: filePath,
  });
}
