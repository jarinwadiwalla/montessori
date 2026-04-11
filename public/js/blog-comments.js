/* ── Blog Comments (Public) ── */
(function () {
  const section = document.getElementById("blog-comments");
  if (!section) return;

  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    .bc-comment { margin-bottom: 20px; padding: 16px; border: 1px solid #E8E0D8; border-radius: 8px; }
    .bc-reply { margin-left: 32px; margin-top: 12px; border-left: 3px solid #B8755D; }
    .bc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .bc-avatar { width: 32px; height: 32px; border-radius: 50%; }
    .bc-name { font-weight: 600; color: #3E312A; font-size: 14px; }
    .bc-time { font-size: 12px; color: #9B8E82; }
    .bc-body { font-size: 14px; line-height: 1.7; color: #5A4D42; }
    .bc-reply-btn { background: none; border: none; color: #B8755D; font-size: 13px; cursor: pointer; padding: 4px 0; margin-top: 8px; font-family: inherit; }
    .bc-reply-btn:hover { text-decoration: underline; }
    .bc-empty { color: #9B8E82; font-size: 14px; font-style: italic; }
    .bc-pending-notice { background: #FAF3E8; border: 1px solid #E8E0D8; border-radius: 6px; padding: 10px 16px; margin-bottom: 16px; font-size: 13px; color: #5A4D42; }
    .bc-form { margin-top: 20px; }
    .bc-form-row { display: flex; gap: 12px; margin-bottom: 12px; }
    .bc-input { flex: 1; padding: 8px 12px; font-size: 14px; border: 1px solid #E8E0D8; border-radius: 6px; font-family: inherit; color: #3E312A; background: #fff; }
    .bc-input:focus { outline: none; border-color: #B8755D; box-shadow: 0 0 0 3px rgba(184,117,93,0.15); }
    .bc-textarea { width: 100%; padding: 8px 12px; font-size: 14px; border: 1px solid #E8E0D8; border-radius: 6px; font-family: inherit; min-height: 100px; resize: vertical; color: #3E312A; background: #fff; }
    .bc-textarea:focus { outline: none; border-color: #B8755D; box-shadow: 0 0 0 3px rgba(184,117,93,0.15); }
    .bc-form-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
    .bc-check { font-size: 13px; color: #5A4D42; display: flex; align-items: center; gap: 6px; }
    .bc-check input { accent-color: #B8755D; }
    .bc-submit { padding: 8px 20px; background: #d4c4e8; color: #3f265b; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit; transition: background 0.15s; }
    .bc-submit:hover { background: #c4b0dc; }
    .bc-submit:disabled { opacity: 0.6; cursor: not-allowed; }
    .bc-form-status { margin-top: 8px; font-size: 13px; }
    .bc-reply-form { margin-top: 12px; }
    @media (max-width: 768px) { .bc-form-row { flex-direction: column; } .bc-reply { margin-left: 16px; } }
  `;
  document.head.appendChild(style);

  const slug = section.dataset.slug;
  const listEl = document.getElementById("comment-list");
  const formRoot = document.getElementById("comment-form-root");

  // Render comment form
  function renderForm(parentId) {
    return `
      <form class="bc-form" onsubmit="return bcSubmit(event, '${slug}', '${parentId || ""}')">
        <div class="bc-form-row">
          <input type="text" name="author_name" placeholder="Your name" required class="bc-input" />
          <input type="email" name="author_email" placeholder="Email (not displayed)" required class="bc-input" />
        </div>
        <textarea name="body" placeholder="Write a comment..." required class="bc-textarea" maxlength="5000"></textarea>
        <div class="bc-form-footer">
          <label class="bc-check"><input type="checkbox" name="notify_replies" checked> Notify me of replies</label>
          <button type="submit" class="bc-submit">Post Comment</button>
        </div>
        <p class="bc-form-status"></p>
      </form>
    `;
  }

  function timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
    if (seconds < 2592000) return Math.floor(seconds / 86400) + "d ago";
    return new Date(dateStr).toLocaleDateString();
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function renderComment(c, isReply) {
    const replies = (c.replies || [])
      .map((r) => renderComment(r, true))
      .join("");

    return `
      <div class="bc-comment ${isReply ? "bc-reply" : ""}" id="comment-${c.id}">
        <div class="bc-header">
          <img class="bc-avatar" src="https://www.gravatar.com/avatar/${c.email_hash}?s=48&d=mp" alt="" width="32" height="32" />
          <span class="bc-name">${escapeHtml(c.author_name)}</span>
          <span class="bc-time">${timeAgo(c.createdAt)}</span>
        </div>
        <div class="bc-body">${escapeHtml(c.body).replace(/\n/g, "<br>")}</div>
        ${!isReply ? `<button class="bc-reply-btn" onclick="bcToggleReply('${c.id}')">Reply</button>` : ""}
        <div class="bc-reply-form" id="reply-form-${c.id}"></div>
        ${replies}
      </div>
    `;
  }

  // Load comments
  async function loadComments() {
    try {
      const res = await fetch(`/api/blog-comments?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) { listEl.innerHTML = ""; return; }
      const data = await res.json();

      if (!data.comments || data.comments.length === 0) {
        listEl.innerHTML = '<p class="bc-empty">No comments yet. Be the first!</p>';
      } else {
        listEl.innerHTML = data.comments.map((c) => renderComment(c, false)).join("");
      }

      // Check for pending comments in localStorage
      const pending = JSON.parse(localStorage.getItem("bc-pending-" + slug) || "[]");
      if (pending.length > 0) {
        const notice = document.createElement("div");
        notice.className = "bc-pending-notice";
        notice.innerHTML = `<p>You have ${pending.length} comment${pending.length > 1 ? "s" : ""} awaiting approval.</p>`;
        listEl.prepend(notice);
      }
    } catch {
      listEl.innerHTML = "";
    }
  }

  // Main comment form
  formRoot.innerHTML = renderForm("");
  loadComments();

  // Global functions
  window.bcSubmit = async function (e, postSlug, parentId) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector(".bc-submit");
    const status = form.querySelector(".bc-form-status");
    btn.disabled = true;
    btn.textContent = "Posting...";
    status.textContent = "";

    const body = {
      slug: postSlug,
      author_name: form.author_name.value.trim(),
      author_email: form.author_email.value.trim(),
      body: form.body.value.trim(),
      notify_replies: form.notify_replies.checked,
    };
    if (parentId) body.parent_id = parentId;

    try {
      const res = await fetch("/api/blog-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // Track pending
        const pending = JSON.parse(localStorage.getItem("bc-pending-" + postSlug) || "[]");
        pending.push(data.comment.id);
        localStorage.setItem("bc-pending-" + postSlug, JSON.stringify(pending));

        form.reset();
        status.textContent = data.message || "Comment submitted for approval!";
        status.style.color = "var(--color-sage, #7A8B6F)";
        loadComments();

        // Close reply form if it was a reply
        if (parentId) {
          const replyForm = document.getElementById("reply-form-" + parentId);
          if (replyForm) replyForm.innerHTML = "";
        }
      } else {
        status.textContent = data.error || "Failed to post comment.";
        status.style.color = "var(--color-terracotta, #B8755D)";
      }
    } catch {
      status.textContent = "Network error. Please try again.";
      status.style.color = "var(--color-terracotta, #B8755D)";
    }

    btn.disabled = false;
    btn.textContent = "Post Comment";
  };

  window.bcToggleReply = function (commentId) {
    const container = document.getElementById("reply-form-" + commentId);
    if (!container) return;
    if (container.innerHTML.trim()) {
      container.innerHTML = "";
    } else {
      container.innerHTML = renderForm(commentId);
    }
  };
})();
