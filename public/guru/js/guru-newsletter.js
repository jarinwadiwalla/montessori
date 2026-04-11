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
    if (_nlMode === "visual") {
      document.execCommand("insertImage", false, url);
    } else {
      const ta = document.getElementById("nl-html-editor");
      ta.setRangeText(`<img src="${url}" alt="${file.name}" style="max-width:100%;">`, ta.selectionStart, ta.selectionEnd, "end");
    }
  }
  input.value = "";
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

async function nlSendToAll() {
  const subject = document.getElementById("nl-subject").value.trim();
  const htmlBody = nlGetHtml();
  if (!subject || !htmlBody) { showToast("Subject and body required", "error"); return; }

  const countData = await apiFetch("/api/subscriber-count");
  const count = countData ? countData.count : "all";

  openModal("Send Newsletter", `Send "${subject}" to ${count} subscribers? This cannot be undone.`, async () => {
    const data = await apiFetch("/api/newsletter-send", {
      method: "POST",
      body: JSON.stringify({ subject, htmlBody }),
    });
    if (data) {
      showToast(data.message || "Sent!", "success");
      nlLoadCampaigns();
    }
  });
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
    if (_nlMode === "visual") {
      document.getElementById("nl-visual-editor").innerHTML = tpl.body || "";
    } else {
      document.getElementById("nl-html-editor").value = tpl.body || "";
    }
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
        <thead><tr><th>Subject</th><th>Sent</th><th>Recipients</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${data.campaigns.map((c) => `
            <tr>
              <td>${escapeHtml(c.subject)}</td>
              <td>${c.totalSent}</td>
              <td>${c.totalRecipients}</td>
              <td><span class="status status-${c.status}">${c.status}</span></td>
              <td>${new Date(c.sentAt).toLocaleString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}
