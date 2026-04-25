/* ── Guru Newsletter ── */

var _nlMode = "visual";

// ── Mode toggle ──
function nlSetMode(mode) {
  _nlMode = mode;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.mode-btn[onclick="nlSetMode('${mode}')"]`).classList.add("active");

  if (mode === "visual") {
    // Sync HTML to visual
    const html = document.getElementById("nl-html-editor").value;
    if (html) document.getElementById("nl-visual-editor").innerHTML = html;
    document.getElementById("nl-visual-wrap").style.display = "";
    document.getElementById("nl-html-wrap").style.display = "none";
  } else {
    // Sync visual to HTML
    const html = document.getElementById("nl-visual-editor").innerHTML;
    document.getElementById("nl-html-editor").value = html;
    document.getElementById("nl-visual-wrap").style.display = "none";
    document.getElementById("nl-html-wrap").style.display = "";
  }
}

function nlGetHtml() {
  if (_nlMode === "visual") {
    return document.getElementById("nl-visual-editor").innerHTML;
  }
  return document.getElementById("nl-html-editor").value;
}

// ── Formatting ──
function nlFormat(command, value) {
  if (command === "createLink") {
    value = prompt("Enter URL:");
    if (!value) return;
  }
  document.execCommand(command, false, value || null);
  document.getElementById("nl-visual-editor").focus();
}

// ── Image upload ──
function nlInsertImage() {
  document.getElementById("nl-image-file").click();
}

async function nlHandleImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const url = await uploadImage(file);
  if (url) {
    const imgHtml = `<img src="${url}" alt="${file.name}" width="484" style="display:block;margin:0 auto;max-width:100%;height:auto;">`;
    if (_nlMode === "visual") {
      document.execCommand("insertHTML", false, imgHtml);
    } else {
      const ta = document.getElementById("nl-html-editor");
      ta.setRangeText(imgHtml, ta.selectionStart, ta.selectionEnd, "end");
    }
  }
  input.value = "";
}

// ── Test email presets ──
function nlSetTestEmail(email) {
  document.getElementById("nl-test-email").value = email;
}

async function nlSendTestBoth() {
  const subject = document.getElementById("nl-subject").value.trim();
  const htmlBody = nlGetHtml();
  if (!subject || !htmlBody) { showToast("Subject and body required", "error"); return; }

  const data = await apiFetch("/api/newsletter-send", {
    method: "POST",
    body: JSON.stringify({
      subject,
      htmlBody,
      testEmails: ["jarin.wadiwalla@gmail.com", "bijanrahnamai@gmail.com"],
    }),
  });
  if (data) showToast(`Test sent to Jarin & Bijan`, "success");
}

// ── Send ──
async function nlSendTest() {
  const email = document.getElementById("nl-test-email").value.trim();
  if (!email) { showToast("Enter a test email address", "error"); return; }

  const subject = document.getElementById("nl-subject").value.trim();
  const htmlBody = nlGetHtml();
  if (!subject || !htmlBody) { showToast("Subject and body required", "error"); return; }

  const data = await apiFetch("/api/newsletter-send", {
    method: "POST",
    body: JSON.stringify({ subject, htmlBody, testEmails: [email] }),
  });
  if (data) showToast(`Test sent to ${email}`, "success");
}

async function nlSendToAudience() {
  const subject = document.getElementById("nl-subject").value.trim();
  const htmlBody = nlGetHtml();
  if (!subject || !htmlBody) { showToast("Subject and body required", "error"); return; }

  const tier = document.getElementById("nl-audience").value;
  const isAnnouncement = document.getElementById("nl-is-announcement").checked;

  const countData = await apiFetch("/api/subscriber-count");
  const count = countData ? countData.count : "all";
  const tierLabel = tier === "founding" ? "founding members" : `${count} subscribers`;

  openModal("Send Newsletter", `Send "${subject}" to ${tierLabel}?${isAnnouncement ? " (announcement mode)" : ""} This cannot be undone.`, async () => {
    const data = await apiFetch("/api/newsletter-send", {
      method: "POST",
      body: JSON.stringify({ subject, htmlBody, tier, isAnnouncement }),
    });
    if (data) {
      showToast(data.message || "Sent!", "success");
      nlLoadCampaigns();
      if (data.failedCount > 0) nlLoadRetries();
    }
  });
}

function nlUpdateAudienceInfo() {
  // Could update count display based on audience
  nlLoadSubscriberCount();
}

// ── Subscriber count ──
async function nlLoadSubscriberCount() {
  const data = await apiFetch("/api/subscriber-count");
  if (data) {
    document.getElementById("nl-subscriber-count").textContent = `${data.count} active subscriber${data.count !== 1 ? "s" : ""}`;
  }
}

// ── Templates ──
async function nlLoadTemplates() {
  const data = await apiFetch("/api/newsletter-templates");
  if (!data) return;
  const select = document.getElementById("nl-template-select");
  const current = select.value;
  select.innerHTML = '<option value="">-- Select template --</option>';
  (data.templates || []).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });
  if (current) select.value = current;
}

async function nlLoadTemplate() {
  const id = document.getElementById("nl-template-select").value;
  if (!id) return;
  const data = await apiFetch("/api/newsletter-templates");
  if (!data) return;
  const tpl = (data.templates || []).find((t) => t.id === id);
  if (tpl) {
    document.getElementById("nl-subject").value = tpl.subject || "";
    // Always load into HTML mode to preserve inline styles and document structure
    document.getElementById("nl-html-editor").value = tpl.body || "";
    document.getElementById("nl-visual-editor").innerHTML = "";
    nlSetMode("html");
    showToast(`Loaded template: ${tpl.name}`, "info");
  }
}

async function nlSaveTemplate() {
  const name = prompt("Template name:");
  if (!name) return;
  const subject = document.getElementById("nl-subject").value;
  const body = nlGetHtml();

  const data = await apiFetch("/api/newsletter-templates", {
    method: "POST",
    body: JSON.stringify({ name, subject, body }),
  });
  if (data) {
    showToast("Template saved!", "success");
    nlLoadTemplates();
  }
}

async function nlDeleteTemplate() {
  const id = document.getElementById("nl-template-select").value;
  if (!id) { showToast("Select a template first", "error"); return; }

  openModal("Delete Template", "Delete this template?", async () => {
    const data = await apiFetch("/api/newsletter-templates", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    if (data) {
      showToast("Template deleted", "success");
      document.getElementById("nl-template-select").value = "";
      nlLoadTemplates();
    }
  });
}

async function nlLoadTemplatesList() {
  const data = await apiFetch("/api/newsletter-templates");
  const container = document.getElementById("templates-list");
  if (!data || !data.templates || data.templates.length === 0) {
    container.innerHTML = '<p class="empty-state">No templates saved yet.</p>';
    return;
  }
  container.innerHTML = data.templates.map((t) => `
    <div class="draft-item">
      <div>
        <strong>${escapeHtml(t.name)}</strong>
        <span class="draft-date">${t.subject || ""}</span>
      </div>
      <div class="btn-group">
        <button class="btn btn-sm btn-secondary" onclick="nlUseTemplate('${escapeHtml(t.id)}')">Use</button>
        <button class="btn btn-sm btn-danger" onclick="nlRemoveTemplate('${escapeHtml(t.id)}')">Delete</button>
      </div>
    </div>
  `).join("");
}

async function nlUseTemplate(id) {
  document.getElementById("nl-template-select").value = id;
  await nlLoadTemplate();
  // Switch to compose
  const parent = document.getElementById("section-newsletter");
  parent.querySelectorAll(".sub-tab").forEach((t) => t.classList.remove("active"));
  parent.querySelectorAll(".sub-section").forEach((s) => s.classList.remove("active"));
  parent.querySelector('.sub-tab[data-sub="nl-compose"]').classList.add("active");
  document.getElementById("sub-nl-compose").classList.add("active");
}

async function nlRemoveTemplate(id) {
  openModal("Delete Template", "Delete this template?", async () => {
    await apiFetch("/api/newsletter-templates", { method: "DELETE", body: JSON.stringify({ id }) });
    showToast("Deleted", "success");
    nlLoadTemplatesList();
    nlLoadTemplates();
  });
}

// ── Campaigns ──
async function nlLoadCampaigns() {
  const data = await apiFetch("/api/newsletter-campaigns");
  const container = document.getElementById("campaigns-list");
  if (!data || !data.campaigns || data.campaigns.length === 0) {
    container.innerHTML = '<p class="empty-state">No campaigns sent yet.</p>';
    return;
  }
  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Subject</th><th>Tier</th><th>Sent</th><th>Recipients</th><th>Status</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${data.campaigns.map((c) => `
            <tr>
              <td>${escapeHtml(c.subject)}</td>
              <td><span class="tier-badge tier-${c.tier || "all"}">${c.tier || "all"}</span></td>
              <td>${c.totalSent}</td>
              <td>${c.totalRecipients}</td>
              <td><span class="status status-${c.status}">${c.status}</span></td>
              <td>${new Date(c.sentAt).toLocaleString()}</td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="nlViewCampaignStats('${escapeHtml(c.id)}')">Stats</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ── Campaign Stats ──
async function nlViewCampaignStats(campaignId) {
  showToast("Loading stats...", "info");
  const data = await apiFetch(`/api/campaign-stats?id=${encodeURIComponent(campaignId)}`);
  if (!data || !data.stats) {
    showToast("Could not load stats", "error");
    return;
  }

  const s = data.stats;
  const openRate = s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0;

  const detailHtml = `
    <div style="padding:16px;">
      <h3 style="margin-top:0;">Campaign Analytics</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:16px;">
        <div class="stat-card"><div class="label">Total</div><div class="value">${s.total}</div></div>
        <div class="stat-card"><div class="label">Delivered</div><div class="value">${s.delivered}</div></div>
        <div class="stat-card"><div class="label">Clicked</div><div class="value">${s.clicked}</div></div>
        <div class="stat-card"><div class="label">Bounced</div><div class="value">${s.bounced}</div></div>
        <div class="stat-card"><div class="label">Complained</div><div class="value">${s.complained}</div></div>
      </div>
      <p style="font-size:13px;color:var(--gray-500);">Delivery rate: ${openRate}%</p>
      ${s.total - s.delivered > 0 ? `
        <button class="btn btn-sm btn-secondary" onclick="nlResendCampaign('${escapeHtml(campaignId)}')">
          Resend to ${s.total - s.delivered} undelivered
        </button>
      ` : '<p style="font-size:13px;color:var(--green-600);">All emails delivered!</p>'}
    </div>
  `;

  // Show in a modal-like overlay
  document.getElementById("modal-title").innerHTML = "Campaign Stats";
  document.getElementById("modal-message").innerHTML = detailHtml;
  document.getElementById("modal-confirm-btn").style.display = "none";
  document.getElementById("modal-overlay").classList.add("active");
}

async function nlResendCampaign(campaignId) {
  closeModal();

  // First do a dry run
  showToast("Checking undelivered...", "info");
  const dryRun = await apiFetch("/api/campaign-resend", {
    method: "POST",
    body: JSON.stringify({ campaignId }),
  });

  if (!dryRun) return;

  if (dryRun.dryRun && dryRun.undelivered > 0) {
    openModal("Resend Campaign", `${dryRun.delivered} delivered, ${dryRun.undelivered} undelivered. Resend to undelivered recipients?`, async () => {
      // Need the HTML body — get it from the compose editor or ask user to load a template
      const htmlBody = nlGetHtml();
      if (!htmlBody) {
        showToast("Load the email template in the composer first, then retry", "error");
        return;
      }
      const result = await apiFetch("/api/campaign-resend", {
        method: "POST",
        body: JSON.stringify({ campaignId, htmlBody }),
      });
      if (result) {
        showToast(result.message || "Resent!", "success");
        nlLoadCampaigns();
      }
    });
  } else {
    showToast(dryRun.message || "All delivered!", "info");
  }
}

// ── Retry Queue ──
async function nlLoadRetries() {
  const data = await apiFetch("/api/newsletter-retry");
  const container = document.getElementById("retries-list");
  const badge = document.getElementById("retry-badge");

  if (!data || !data.retries || data.retries.length === 0) {
    container.innerHTML = '<p class="empty-state">No pending retries.</p>';
    if (badge) { badge.style.display = "none"; }
    return;
  }

  if (badge) {
    badge.textContent = data.retries.length;
    badge.style.display = "";
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Subject</th><th>Failed</th><th>Retries</th><th>Original Date</th><th></th></tr></thead>
        <tbody>
          ${data.retries.map((r) => `
            <tr>
              <td>${escapeHtml(r.subject)}</td>
              <td>${r.failedRecipients.length}</td>
              <td>${r.retryCount}</td>
              <td>${new Date(r.originalSentAt).toLocaleString()}</td>
              <td>
                <button class="btn btn-sm btn-primary" onclick="nlRetryOne('${escapeHtml(r.id)}')">Retry</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function nlRetryOne(retryId) {
  showToast("Processing retry...", "info");
  const data = await apiFetch("/api/newsletter-retry", {
    method: "POST",
    body: JSON.stringify({ retryId }),
  });
  if (data) {
    showToast(data.message || "Retry processed!", "success");
    nlLoadRetries();
    nlLoadCampaigns();
  }
}

async function nlRetryAll() {
  openModal("Retry All", "Process all pending retries?", async () => {
    showToast("Processing retries...", "info");
    const data = await apiFetch("/api/newsletter-retry", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (data) {
      showToast(data.message || "All retries processed!", "success");
      nlLoadRetries();
      nlLoadCampaigns();
    }
  });
}

// ── Subscribers (in newsletter context) ──
async function loadSubscribers() {
  const filter = document.getElementById("subscriber-filter").value;
  const url = filter ? `/api/subscribers?filter=${filter}` : "/api/subscribers";
  const data = await apiFetch(url);
  const tbody = document.getElementById("subscribers-body");
  const countsEl = document.getElementById("subscriber-counts");

  if (!data || !data.subscribers) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No subscribers found.</td></tr>';
    return;
  }

  // Show counts
  if (data.counts && countsEl) {
    countsEl.innerHTML = `
      <span>Total: <strong>${data.counts.total}</strong></span>
      <span>Active: <strong>${data.counts.active}</strong></span>
      <span>Unsubscribed: <strong>${data.counts.unsubscribed}</strong></span>
      <span>Founding: <strong>${data.counts.founding}</strong></span>
    `;
  }

  tbody.innerHTML = data.subscribers.map((s) => `
    <tr>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml((s.firstName || "") + " " + (s.lastName || "")).trim()}</td>
      <td><span class="tier-badge tier-${s.tier || "subscriber"}">${s.tier || "subscriber"}</span></td>
      <td>${s.preferences || "all"}</td>
      <td>${new Date(s.subscribedAt).toLocaleDateString()}</td>
      <td><span class="status status-${s.unsubscribed ? "error" : "sent"}">${s.unsubscribed ? "Unsubscribed" : "Active"}</span></td>
      <td>
        <div class="btn-group">
          <button class="btn btn-sm btn-outline" onclick="openSubscriberEdit('${escapeHtml(s.email)}', '${escapeHtml(s.firstName || "")}', '${escapeHtml(s.lastName || "")}', '${s.tier || "subscriber"}', '${s.preferences || "all"}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="removeSubscriber('${escapeHtml(s.email)}')">Remove</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openSubscriberEdit(email, first, last, tier, pref) {
  document.getElementById("sub-edit-old-email").value = email;
  document.getElementById("sub-edit-email").value = email;
  document.getElementById("sub-edit-first").value = first;
  document.getElementById("sub-edit-last").value = last;
  document.getElementById("sub-edit-tier").value = tier;
  document.getElementById("sub-edit-pref").value = pref;
  document.getElementById("subscriber-edit-overlay").classList.add("active");
}

function closeSubscriberEdit() {
  document.getElementById("subscriber-edit-overlay").classList.remove("active");
}

async function saveSubscriberEdit() {
  const oldEmail = document.getElementById("sub-edit-old-email").value;
  const newEmail = document.getElementById("sub-edit-email").value.trim();
  const firstName = document.getElementById("sub-edit-first").value.trim();
  const lastName = document.getElementById("sub-edit-last").value.trim();
  const tier = document.getElementById("sub-edit-tier").value;
  const preference = document.getElementById("sub-edit-pref").value;

  const data = await apiFetch("/api/subscriber-edit", {
    method: "POST",
    body: JSON.stringify({ oldEmail, newEmail, firstName, lastName, tier, preference }),
  });

  if (data) {
    showToast(data.message || "Updated!", "success");
    closeSubscriberEdit();
    loadSubscribers();
  }
}

async function removeSubscriber(email) {
  openModal("Remove Subscriber", `Remove ${email} from the subscriber list? This cannot be undone.`, async () => {
    const data = await apiFetch("/api/subscribers", {
      method: "DELETE",
      body: JSON.stringify({ email }),
    });
    if (data) {
      showToast("Subscriber removed", "success");
      loadSubscribers();
    }
  });
}
