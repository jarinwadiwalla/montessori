/* ── Guru Blog ── */

var _blogAutoSaveTimer = null;
var _blogCurrentSlug = null;
const BLOG_DRAFT_KEY = "montessori-blog-draft";

// ── Auto slug ──
function blogAutoSlug() {
  const title = document.getElementById("blog-title").value;
  const slugEl = document.getElementById("blog-slug");
  if (!_blogCurrentSlug) {
    slugEl.value = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
}

// ── Markdown formatting ──
function blogMdFormat(type) {
  const ta = document.getElementById("blog-body");
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const sel = ta.value.substring(start, end);
  let insert = "";

  switch (type) {
    case "bold": insert = `**${sel || "bold text"}**`; break;
    case "italic": insert = `*${sel || "italic text"}*`; break;
    case "h2": insert = `\n## ${sel || "Heading"}\n`; break;
    case "h3": insert = `\n### ${sel || "Heading"}\n`; break;
    case "link": insert = `[${sel || "link text"}](url)`; break;
    case "image": insert = `![${sel || "alt text"}](url)`; break;
    case "ul": insert = `\n- ${sel || "item"}\n`; break;
    case "quote": insert = `\n> ${sel || "quote"}\n`; break;
  }

  ta.setRangeText(insert, start, end, "end");
  ta.focus();
  blogUpdatePreview();
  blogAutoSaveLocal();
}

// ── Preview ──
function blogUpdatePreview() {
  const md = document.getElementById("blog-body").value;
  document.getElementById("blog-preview").innerHTML = markdownToHtml(md) || '<p style="color:var(--gray-400);">Preview will appear here...</p>';
  blogAutoSaveLocal();
}

// ── Local auto-save ──
function blogAutoSaveLocal() {
  clearTimeout(_blogAutoSaveTimer);
  _blogAutoSaveTimer = setTimeout(() => {
    const draft = blogCollectDraft();
    localStorage.setItem(BLOG_DRAFT_KEY, JSON.stringify(draft));
    document.getElementById("blog-auto-save-status").textContent = `Auto-saved locally at ${new Date().toLocaleTimeString()}`;
  }, 1000);
}

function blogCollectDraft() {
  return {
    title: document.getElementById("blog-title").value,
    slug: document.getElementById("blog-slug").value,
    date: document.getElementById("blog-date").value,
    author: document.getElementById("blog-author").value,
    description: document.getElementById("blog-description").value,
    image: document.getElementById("blog-image").value,
    body: document.getElementById("blog-body").value,
    featured: document.getElementById("blog-featured").checked,
  };
}

function blogLoadIntoDraft(draft) {
  document.getElementById("blog-title").value = draft.title || "";
  document.getElementById("blog-slug").value = draft.slug || "";
  document.getElementById("blog-date").value = draft.date || "";
  document.getElementById("blog-author").value = draft.author || "Jarin Wadiwalla";
  document.getElementById("blog-description").value = draft.description || "";
  document.getElementById("blog-image").value = draft.image || "";
  document.getElementById("blog-body").value = draft.body || "";
  document.getElementById("blog-featured").checked = !!draft.featured;
  _blogCurrentSlug = draft.slug || null;
  blogUpdatePreview();
}

function blogClearEditor() {
  _blogCurrentSlug = null;
  document.getElementById("blog-title").value = "";
  document.getElementById("blog-slug").value = "";
  document.getElementById("blog-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("blog-author").value = "Jarin Wadiwalla";
  document.getElementById("blog-description").value = "";
  document.getElementById("blog-image").value = "";
  document.getElementById("blog-body").value = "";
  document.getElementById("blog-featured").checked = false;
  document.getElementById("blog-preview").innerHTML = '<p style="color:var(--gray-400);">Preview will appear here...</p>';
  document.getElementById("blog-auto-save-status").textContent = "";
  localStorage.removeItem(BLOG_DRAFT_KEY);
}

// ── Preview ──
async function blogPreview() {
  const draft = blogCollectDraft();
  if (!draft.slug) {
    showToast("Save the draft first to preview it", "error");
    return;
  }
  // Save silently first so preview reflects latest content
  await apiFetch("/api/blog-drafts", {
    method: "POST",
    body: JSON.stringify({ draft }),
  });
  window.open(`/guru/preview?slug=${encodeURIComponent(draft.slug)}`, "_blank");
}

// ── Save draft ──
async function blogSaveDraft() {
  const draft = blogCollectDraft();
  if (!draft.title || !draft.slug) {
    showToast("Title and slug are required", "error");
    return;
  }
  const data = await apiFetch("/api/blog-drafts", {
    method: "POST",
    body: JSON.stringify({ draft }),
  });
  if (data) {
    _blogCurrentSlug = draft.slug;
    showToast("Draft saved!", "success");
    localStorage.removeItem(BLOG_DRAFT_KEY);
  }
}

// ── Publish ──
async function blogPublish() {
  const draft = blogCollectDraft();
  if (!draft.title || !draft.slug) {
    showToast("Title and slug are required", "error");
    return;
  }

  openModal("Publish Post", `Publish "${draft.title}" to the live site? This will commit to GitHub and trigger a rebuild.`, async () => {
    const data = await apiFetch("/api/blog-publish", {
      method: "POST",
      body: JSON.stringify({ slug: draft.slug, draft }),
    });
    if (data) {
      showToast(data.message || "Published!", "success");
      blogClearEditor();
      blogLoadDrafts();
    }
  });
}

// ── Load drafts ──
async function blogLoadDrafts() {
  const data = await apiFetch("/api/blog-drafts");
  const container = document.getElementById("drafts-list");
  if (!data || !data.drafts || data.drafts.length === 0) {
    container.innerHTML = '<p class="empty-state">No drafts yet.</p>';
    return;
  }
  container.innerHTML = data.drafts.map((d) => `
    <div class="draft-item">
      <div>
        <span class="draft-title" onclick="blogEditDraft('${escapeHtml(d.slug)}')">${escapeHtml(d.title)}</span>
        <span class="draft-date">${d.date || ""}</span>
      </div>
      <div class="btn-group">
        <button class="btn btn-sm btn-secondary" onclick="blogEditDraft('${escapeHtml(d.slug)}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="blogDeleteDraft('${escapeHtml(d.slug)}')">Delete</button>
      </div>
    </div>
  `).join("");
}

async function blogEditDraft(slug) {
  const data = await apiFetch("/api/blog-drafts");
  if (!data) return;
  const draft = data.drafts.find((d) => d.slug === slug);
  if (draft) {
    blogLoadIntoDraft(draft);
    // Switch to editor sub-tab
    const parent = document.getElementById("section-blog");
    parent.querySelectorAll(".sub-tab").forEach((t) => t.classList.remove("active"));
    parent.querySelectorAll(".sub-section").forEach((s) => s.classList.remove("active"));
    parent.querySelector('.sub-tab[data-sub="blog-editor"]').classList.add("active");
    document.getElementById("sub-blog-editor").classList.add("active");
  }
}

async function blogDeleteDraft(slug) {
  openModal("Delete Draft", `Delete draft "${slug}"? This cannot be undone.`, async () => {
    const data = await apiFetch("/api/blog-drafts", {
      method: "DELETE",
      body: JSON.stringify({ slug }),
    });
    if (data) {
      showToast("Draft deleted", "success");
      blogLoadDrafts();
    }
  });
}

// ── Load published ──
async function blogLoadPublished() {
  const data = await apiFetch("/api/blog-posts");
  const container = document.getElementById("published-list");
  if (!data || !data.posts || data.posts.length === 0) {
    container.innerHTML = '<p class="empty-state">No published posts yet.</p>';
    return;
  }
  container.innerHTML = data.posts.map((p) => `
    <div class="draft-item">
      <div>
        <span class="draft-title" onclick="blogEditPublished('${escapeHtml(p.slug)}')">${escapeHtml(p.title || p.slug)}</span>
        <span class="draft-date">${p.publishDate || p.date || ""}</span>
      </div>
      <div class="btn-group">
        <button class="btn btn-sm btn-secondary" onclick="blogEditPublished('${escapeHtml(p.slug)}')">Edit</button>
        <a href="/blog/${p.slug}/" target="_blank" class="btn btn-sm btn-outline">View</a>
        <button class="btn btn-sm btn-danger" onclick="blogDeletePublished('${escapeHtml(p.slug)}')">Delete</button>
      </div>
    </div>
  `).join("");
}

async function blogEditPublished(slug) {
  const data = await apiFetch(`/api/blog-posts?slug=${encodeURIComponent(slug)}`);
  if (!data || !data.post) return;
  const post = data.post;
  blogLoadIntoDraft({
    title: post.title || "",
    slug: post.slug || slug,
    date: post.publishDate || post.date || "",
    author: post.author || "Jarin Wadiwalla",
    description: post.description || "",
    image: post.image || "",
    body: post.body || "",
    featured: post.featured === true || post.featured === "true",
  });
  // Switch to editor
  const parent = document.getElementById("section-blog");
  parent.querySelectorAll(".sub-tab").forEach((t) => t.classList.remove("active"));
  parent.querySelectorAll(".sub-section").forEach((s) => s.classList.remove("active"));
  parent.querySelector('.sub-tab[data-sub="blog-editor"]').classList.add("active");
  document.getElementById("sub-blog-editor").classList.add("active");
}

async function blogDeletePublished(slug) {
  openModal("Delete Published Post", `Delete "${slug}" from the live site? This will remove it from GitHub.`, async () => {
    const data = await apiFetch("/api/blog-posts", {
      method: "DELETE",
      body: JSON.stringify({ slug }),
    });
    if (data) {
      showToast("Post deleted", "success");
      blogLoadPublished();
    }
  });
}

// ── Image upload ──
function blogUploadCoverImage() {
  document.getElementById("blog-image-file").click();
}

async function blogHandleCoverUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const url = await uploadImage(file);
  if (url) document.getElementById("blog-image").value = url;
  input.value = "";
}

function blogInsertImage() {
  document.getElementById("blog-inline-image-file").click();
}

async function blogHandleInlineUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const url = await uploadImage(file);
  if (url) {
    const ta = document.getElementById("blog-body");
    const insert = `\n![${file.name}](${url})\n`;
    ta.setRangeText(insert, ta.selectionStart, ta.selectionEnd, "end");
    ta.focus();
    blogUpdatePreview();
  }
  input.value = "";
}

async function uploadImage(file) {
  showToast("Uploading image...", "info");

  // Try presigned URL first
  const presign = await apiFetch("/api/file-presign", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  });

  if (!presign) return null;

  if (presign.method === "direct") {
    // Direct upload to our endpoint
    const formData = new FormData();
    formData.append("file", file);
    formData.append("key", presign.key);

    const res = await apiFetchRaw("/api/image-upload", {
      method: "POST",
      body: formData,
      headers: {}, // let browser set content-type for FormData
    });

    if (res.ok) {
      const data = await res.json();
      showToast("Image uploaded!", "success");
      return data.url;
    } else {
      showToast("Upload failed", "error");
      return null;
    }
  } else {
    // Presigned URL upload
    const uploadRes = await fetch(presign.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    if (!uploadRes.ok) {
      showToast("Upload failed", "error");
      return null;
    }

    const confirm = await apiFetch("/api/file-confirm", {
      method: "POST",
      body: JSON.stringify({ key: presign.key }),
    });

    if (confirm) {
      showToast("Image uploaded!", "success");
      return confirm.url;
    }
    return null;
  }
}

// ── Restore local draft on load ──
document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem(BLOG_DRAFT_KEY);
  if (saved) {
    try {
      const draft = JSON.parse(saved);
      if (draft.title || draft.body) {
        blogLoadIntoDraft(draft);
        document.getElementById("blog-auto-save-status").textContent = "Restored from local auto-save";
      }
    } catch {}
  }
  // Set default date
  if (!document.getElementById("blog-date").value) {
    document.getElementById("blog-date").value = new Date().toISOString().split("T")[0];
  }
});
