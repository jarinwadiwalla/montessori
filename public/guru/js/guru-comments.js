/* ── Guru Comments ── */

async function loadComments() {
  const status = document.getElementById("comments-filter").value;
  const data = await apiFetch(`/api/blog-comments?admin=1&status=${status}`);
  const container = document.getElementById("comments-list");

  if (!data || !data.comments || data.comments.length === 0) {
    container.innerHTML = `<p class="empty-state">No ${status === "all" ? "" : status} comments.</p>`;
    return;
  }

  // Update badge
  if (data.pending_count !== undefined) {
    const badge = document.getElementById("pending-badge");
    if (data.pending_count > 0) {
      badge.textContent = data.pending_count;
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  }

  container.innerHTML = data.comments.map((c) => `
    <div class="comment-card ${c.status === "pending" ? "pending" : ""}">
      <div class="comment-meta">
        <img class="avatar" src="https://www.gravatar.com/avatar/${c.email_hash}?s=64&d=mp" alt="">
        <span class="name">${escapeHtml(c.author_name)}</span>
        <span class="email">${escapeHtml(c.author_email)}</span>
        <span class="date">${new Date(c.createdAt).toLocaleString()}</span>
      </div>
      <div class="comment-slug">on <a href="/blog/${escapeHtml(c.slug)}/" target="_blank">/blog/${escapeHtml(c.slug)}/</a>
        ${c.parent_id ? ' (reply)' : ''}
      </div>
      <div class="comment-body">${escapeHtml(c.body)}</div>
      <div class="comment-actions">
        <span class="status status-${c.status}">${c.status}</span>
        ${c.status !== "approved" ? `<button class="btn btn-sm btn-success" onclick="moderateComment('${c.id}', 'approved')">Approve</button>` : ""}
        ${c.status !== "rejected" ? `<button class="btn btn-sm btn-secondary" onclick="moderateComment('${c.id}', 'rejected')">Reject</button>` : ""}
        <button class="btn btn-sm btn-danger" onclick="deleteComment('${c.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

async function moderateComment(id, status) {
  const data = await apiFetch("/api/blog-comments", {
    method: "PUT",
    body: JSON.stringify({ id, status }),
  });
  if (data) {
    showToast(`Comment ${status}`, "success");
    loadComments();
    // Update dashboard badge
    const pending = await apiFetch("/api/blog-comments?admin=1&status=pending");
    if (pending) {
      document.getElementById("stat-pending-comments").textContent = pending.pending_count || 0;
    }
  }
}

async function deleteComment(id) {
  openModal("Delete Comment", "Delete this comment and its replies? This cannot be undone.", async () => {
    const data = await apiFetch("/api/blog-comments", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    if (data) {
      showToast("Comment deleted", "success");
      loadComments();
    }
  });
}
