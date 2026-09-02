/* ── Guru Blog Ideas ──
 *
 * A running list of what to write next. Stored in the settings blob the
 * same way Notes is, so it needs no table of its own and no migration.
 */

var _ideas = [];

const IDEA_STATUS = {
  idea: { label: "Idea", colour: "var(--gray-500)" },
  drafting: { label: "Drafting", colour: "#b87440" },
  done: { label: "Published", colour: "#7A8B6F" },
};

async function ideasLoad() {
  const data = await apiFetch("/api/settings");
  if (!data) return;
  _ideas = Array.isArray(data.blogIdeas) ? data.blogIdeas : [];
  ideasRender();
}

async function ideasSave() {
  await apiFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify({ blogIdeas: _ideas }),
  });
}

function ideasRender() {
  const list = document.getElementById("idea-list");
  const count = document.getElementById("idea-count");
  if (!list) return;

  const open = _ideas.filter((i) => i.status !== "done").length;
  if (count) {
    count.textContent = _ideas.length
      ? `${open} to write, ${_ideas.length} total`
      : "";
  }

  if (!_ideas.length) {
    list.innerHTML = '<p class="empty-state">No ideas yet. Add the first one above.</p>';
    return;
  }

  // Unwritten first, so the list opens on what still needs doing.
  const order = { drafting: 0, idea: 1, done: 2 };
  const sorted = [..._ideas].sort(
    (a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1)
  );

  list.innerHTML = sorted
    .map((idea) => {
      const st = IDEA_STATUS[idea.status] || IDEA_STATUS.idea;
      const faded = idea.status === "done" ? "opacity:.6;" : "";
      return `
      <div class="campaign-item" style="${faded}align-items:flex-start;">
        <div style="min-width:0;flex:1;">
          <strong style="${idea.status === "done" ? "text-decoration:line-through;" : ""}">${escapeHtml(idea.title)}</strong>
          <span class="badge" style="background:${st.colour};color:#fff;margin-left:8px;">${st.label}</span>
          ${idea.notes ? `<div style="font-size:13px;color:var(--gray-500);margin-top:6px;white-space:pre-wrap;">${escapeHtml(idea.notes)}</div>` : ""}
          <div style="font-size:11px;color:var(--gray-500);margin-top:6px;">Added ${new Date(idea.created_at).toLocaleDateString()}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <select class="form-input" style="font-size:12px;padding:4px 8px;width:auto;"
                  onchange="ideaSetStatus('${idea.id}', this.value)">
            ${Object.entries(IDEA_STATUS)
              .map(
                ([k, v]) =>
                  `<option value="${k}"${idea.status === k ? " selected" : ""}>${v.label}</option>`
              )
              .join("")}
          </select>
          <button class="btn btn-secondary btn-sm" onclick="ideaEdit('${idea.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="ideaDelete('${idea.id}')">Delete</button>
        </div>
      </div>`;
    })
    .join("");
}

async function ideaAdd() {
  const titleEl = document.getElementById("idea-title");
  const notesEl = document.getElementById("idea-notes");
  const statusEl = document.getElementById("idea-status");

  const title = titleEl.value.trim();
  if (!title) {
    showToast("Give the idea a title.", "error");
    return;
  }

  _ideas.unshift({
    id: "idea-" + Date.now(),
    title,
    notes: notesEl.value.trim(),
    status: statusEl.value || "idea",
    created_at: new Date().toISOString(),
  });

  await ideasSave();
  titleEl.value = "";
  notesEl.value = "";
  statusEl.value = "idea";
  ideasRender();
  showToast("Idea added.", "success");
}

async function ideaSetStatus(id, status) {
  const idea = _ideas.find((i) => i.id === id);
  if (!idea) return;
  idea.status = status;
  await ideasSave();
  ideasRender();
}

async function ideaEdit(id) {
  const idea = _ideas.find((i) => i.id === id);
  if (!idea) return;

  const title = prompt("Title", idea.title);
  if (title === null) return;
  const notes = prompt("Notes", idea.notes || "");
  if (notes === null) return;

  idea.title = title.trim() || idea.title;
  idea.notes = notes.trim();
  await ideasSave();
  ideasRender();
  showToast("Idea updated.", "success");
}

async function ideaDelete(id) {
  const idea = _ideas.find((i) => i.id === id);
  if (!idea) return;
  if (!confirm(`Delete "${idea.title}"?`)) return;
  _ideas = _ideas.filter((i) => i.id !== id);
  await ideasSave();
  ideasRender();
  showToast("Idea deleted.", "success");
}
