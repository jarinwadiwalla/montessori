/* ── Guru Core ── */
var _adminToken = null;
var _modalCallback = null;

// ── Init ──
document.addEventListener("DOMContentLoaded", async () => {
  updateDate();
  setupTabs();
  setupSubTabs();
  await fetchAdminSession();
  loadDashboardStats();
});


function updateDate() {
  const el = document.getElementById("header-date");
  if (el) el.textContent = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

async function fetchAdminSession() {
  try {
    const res = await fetch("/api/admin-session");
    if (res.ok) {
      const data = await res.json();
      if (data.token) _adminToken = data.token;
    }
  } catch {}
}

// ── API Fetch ──
async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (_adminToken) headers["X-Admin-Token"] = _adminToken;
  options.headers = headers;

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      showToast(err.error || `Error: ${res.status}`, "error");
      return null;
    }
    return await res.json();
  } catch (err) {
    showToast(`Network error: ${err.message}`, "error");
    return null;
  }
}

async function apiFetchRaw(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (_adminToken) headers["X-Admin-Token"] = _adminToken;
  options.headers = headers;
  return fetch(url, options);
}

// ── Tabs ──
function setupTabs() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const section = tab.dataset.section;
      switchTab(section);
    });
  });
}

function switchTab(sectionName) {
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));

  const tab = document.querySelector(`.nav-tab[data-section="${sectionName}"]`);
  const section = document.getElementById(`section-${sectionName}`);
  if (tab) tab.classList.add("active");
  if (section) section.classList.add("active");

  // Lazy load data
  if (sectionName === "blog") blogLoadDrafts();
  if (sectionName === "newsletter") { nlLoadTemplates(); nlLoadCampaigns(); nlLoadSubscriberCount(); nlLoadRetries(); }
  if (sectionName === "subscribers") loadSubscribers();
  if (sectionName === "comments") loadComments();
  if (sectionName === "notes") notesLoad();
}

function setupSubTabs() {
  document.querySelectorAll(".sub-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const parent = tab.closest(".section");
      const subName = tab.dataset.sub;

      parent.querySelectorAll(".sub-tab").forEach((t) => t.classList.remove("active"));
      parent.querySelectorAll(".sub-section").forEach((s) => s.classList.remove("active"));

      tab.classList.add("active");
      const sub = document.getElementById(`sub-${subName}`);
      if (sub) sub.classList.add("active");

      if (subName === "blog-drafts") blogLoadDrafts();
      if (subName === "blog-published") blogLoadPublished();
      if (subName === "nl-campaigns") nlLoadCampaigns();
      if (subName === "nl-templates") nlLoadTemplatesList();
      if (subName === "nl-retries") nlLoadRetries();
    });
  });
}

// ── Toast ──
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ── Modal ──
function openModal(title, message, callback) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-message").textContent = message;
  _modalCallback = callback;
  document.getElementById("modal-overlay").classList.add("active");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("active");
  document.getElementById("modal-confirm-btn").style.display = "";
  _modalCallback = null;
}

function modalConfirm() {
  if (_modalCallback) _modalCallback();
  closeModal();
}

// ── Markdown to HTML ──
function markdownToHtml(md) {
  if (!md) return "";
  let html = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

  // Wrap loose text in paragraphs
  html = html.split("\n\n").map((block) => {
    block = block.trim();
    if (!block) return "";
    if (block.startsWith("<h") || block.startsWith("<ul") || block.startsWith("<blockquote") || block.startsWith("<li")) return block;
    return `<p>${block}</p>`;
  }).join("\n");

  return html;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Dashboard ──
async function loadDashboardStats() {
  const [subData, draftsData, commentsData, campaignsData] = await Promise.all([
    apiFetch("/api/subscriber-count"),
    apiFetch("/api/blog-drafts"),
    apiFetch("/api/blog-comments?admin=1&status=pending"),
    apiFetch("/api/newsletter-campaigns"),
  ]);

  if (subData) document.getElementById("stat-subscribers").textContent = subData.count || 0;
  if (draftsData) document.getElementById("stat-drafts").textContent = (draftsData.drafts || []).length;
  if (commentsData) {
    const count = commentsData.pending_count || 0;
    document.getElementById("stat-pending-comments").textContent = count;
    const badge = document.getElementById("pending-badge");
    if (count > 0) { badge.textContent = count; badge.style.display = ""; }
    else { badge.style.display = "none"; }
  }

  // Published count (from drafts we know count, but let's also show)
  apiFetch("/api/blog-posts").then((data) => {
    if (data) document.getElementById("stat-published").textContent = (data.posts || []).length;
  });

  // Recent campaigns
  if (campaignsData && campaignsData.campaigns) {
    const container = document.getElementById("dashboard-campaigns");
    const recent = campaignsData.campaigns.slice(0, 5);
    if (recent.length === 0) {
      container.innerHTML = '<p class="empty-state">No campaigns sent yet.</p>';
    } else {
      container.innerHTML = recent.map((c) => `
        <div class="campaign-item">
          <div>
            <strong>${escapeHtml(c.subject)}</strong>
            <div style="font-size:12px;color:var(--gray-400);">${new Date(c.sentAt).toLocaleDateString()}</div>
          </div>
          <div style="text-align:right;">
            <span class="status status-${c.status}">${c.status}</span>
            <div style="font-size:12px;color:var(--gray-500);">${c.totalSent}/${c.totalRecipients} sent</div>
          </div>
        </div>
      `).join("");
    }
  }
}

// Handle hash navigation for direct links (e.g., /guru/#comments)
window.addEventListener("hashchange", () => {
  const hash = window.location.hash.replace("#", "");
  if (hash) switchTab(hash);
});
if (window.location.hash) {
  const hash = window.location.hash.replace("#", "");
  if (hash) setTimeout(() => switchTab(hash), 100);
}
