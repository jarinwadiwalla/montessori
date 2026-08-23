/* ── System emails: the transactional templates, editable in place ── */

var _sysmailTemplates = [];
var _sysmailCurrent = null;

// Sample values used by Preview, so {{placeholders}} render as something real.
var SYSMAIL_SAMPLE = {
  greeting_name: " Jarin",
  first_name: "Jarin",
  welcome_word: "Welcome",
  link: "https://montessoriforadolescents.com/collective/verify/?token=example",
  unsub_url: "https://montessoriforadolescents.com/api/unsubscribe?email=example",
  expires_minutes: "20",
  site: "https://montessoriforadolescents.com",
  dues_note: '<p style="color:#6b5b7d;font-size:14px;">Your dues renew monthly.</p>',
};

async function sysmailLoad() {
  const data = await apiFetch("/api/email-templates");
  if (!data) return;
  _sysmailTemplates = data.templates || [];

  const list = document.getElementById("sysmail-list");
  list.innerHTML = _sysmailTemplates
    .map(
      (t) => `
      <div class="campaign-item">
        <div>
          <strong>${escapeHtml(t.label)}</strong>
          ${t.overridden ? '<span class="badge">edited</span>' : ""}
          <div style="font-size:12px;color:var(--gray-500);">${escapeHtml(t.description)}</div>
          <div style="font-size:12px;color:var(--gray-400);">Subject: ${escapeHtml(t.subject)}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="sysmailEdit('${t.key}')">Edit</button>
      </div>`
    )
    .join("");
}

function sysmailEdit(key) {
  _sysmailCurrent = _sysmailTemplates.find((t) => t.key === key);
  if (!_sysmailCurrent) return;

  document.getElementById("sysmail-editor").style.display = "";
  document.getElementById("sysmail-editor-title").textContent = _sysmailCurrent.label;
  document.getElementById("sysmail-editor-desc").textContent = _sysmailCurrent.description;
  document.getElementById("sysmail-editor-vars").textContent = _sysmailCurrent.vars.length
    ? "Available placeholders: " + _sysmailCurrent.vars.map((v) => `{{${v}}}`).join("  ")
    : "This email has no placeholders.";
  document.getElementById("sysmail-subject").value = _sysmailCurrent.subject;
  document.getElementById("sysmail-html").value = _sysmailCurrent.html;
  document.getElementById("sysmail-restore-btn").style.display = _sysmailCurrent.overridden
    ? ""
    : "none";
  document.getElementById("sysmail-preview").style.display = "none";
  document.getElementById("sysmail-editor").scrollIntoView({ behavior: "smooth" });
}

function sysmailCloseEditor() {
  document.getElementById("sysmail-editor").style.display = "none";
  _sysmailCurrent = null;
}

function sysmailPreview() {
  const html = document.getElementById("sysmail-html").value.replace(
    /\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
    (_, name) => SYSMAIL_SAMPLE[name] ?? ""
  );
  const frame = document.getElementById("sysmail-preview");
  frame.style.display = "";
  frame.srcdoc = html;
}

async function sysmailSave() {
  if (!_sysmailCurrent) return;
  const data = await apiFetch("/api/email-templates", {
    method: "PUT",
    body: JSON.stringify({
      key: _sysmailCurrent.key,
      subject: document.getElementById("sysmail-subject").value,
      html: document.getElementById("sysmail-html").value,
    }),
  });
  if (data) {
    showToast("Template saved — new emails use it immediately.", "success");
    sysmailCloseEditor();
    sysmailLoad();
  }
}

function sysmailRestore() {
  if (!_sysmailCurrent) return;
  openModal(
    "Restore default",
    `Discard your edited version of "${_sysmailCurrent.label}" and go back to the built-in email?`,
    async () => {
      const data = await apiFetch("/api/email-templates", {
        method: "DELETE",
        body: JSON.stringify({ key: _sysmailCurrent.key }),
      });
      if (data) {
        showToast("Default restored.", "success");
        sysmailCloseEditor();
        sysmailLoad();
      }
    }
  );
}
