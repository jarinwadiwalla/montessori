/* ── Guru Notes ── */

var _notesTabs = [];
var _notesActiveTab = null;
var _notesSaveTimer = null;

async function notesLoad() {
  const data = await apiFetch("/api/settings");
  if (!data) return;

  _notesTabs = data.notesTabs || [
    { id: "notes-" + Date.now(), title: "General", notes: "" },
  ];

  notesRenderTabs();
  if (_notesTabs.length > 0) {
    notesSelectTab(_notesTabs[0].id);
  }
}

function notesRenderTabs() {
  const container = document.getElementById("notes-tabs");
  container.innerHTML = _notesTabs.map((tab) => `
    <div class="note-tab ${tab.id === _notesActiveTab ? "active" : ""}" onclick="notesSelectTab('${tab.id}')">
      <span ondblclick="notesRenameTab('${tab.id}')">${escapeHtml(tab.title)}</span>
      ${_notesTabs.length > 1 ? `<span class="close-tab" onclick="event.stopPropagation(); notesDeleteTab('${tab.id}')">&times;</span>` : ""}
    </div>
  `).join("");
}

function notesSelectTab(id) {
  // Save current tab content first
  if (_notesActiveTab) {
    const tab = _notesTabs.find((t) => t.id === _notesActiveTab);
    if (tab) tab.notes = document.getElementById("notes-editor").value;
  }

  _notesActiveTab = id;
  const tab = _notesTabs.find((t) => t.id === id);
  if (tab) {
    document.getElementById("notes-editor").value = tab.notes || "";
  }
  notesRenderTabs();
}

function notesAddTab() {
  const title = prompt("Tab name:");
  if (!title) return;
  const newTab = { id: "notes-" + Date.now(), title, notes: "" };
  _notesTabs.push(newTab);
  notesRenderTabs();
  notesSelectTab(newTab.id);
  notesSave();
}

function notesRenameTab(id) {
  const tab = _notesTabs.find((t) => t.id === id);
  if (!tab) return;
  const newTitle = prompt("Rename tab:", tab.title);
  if (newTitle) {
    tab.title = newTitle;
    notesRenderTabs();
    notesSave();
  }
}

function notesDeleteTab(id) {
  if (_notesTabs.length <= 1) return;
  openModal("Delete Tab", "Delete this notes tab?", () => {
    _notesTabs = _notesTabs.filter((t) => t.id !== id);
    if (_notesActiveTab === id) {
      _notesActiveTab = _notesTabs[0]?.id || null;
      if (_notesActiveTab) {
        const tab = _notesTabs.find((t) => t.id === _notesActiveTab);
        document.getElementById("notes-editor").value = tab?.notes || "";
      }
    }
    notesRenderTabs();
    notesSave();
  });
}

function notesAutoSave() {
  clearTimeout(_notesSaveTimer);
  // Update current tab content
  if (_notesActiveTab) {
    const tab = _notesTabs.find((t) => t.id === _notesActiveTab);
    if (tab) tab.notes = document.getElementById("notes-editor").value;
  }
  _notesSaveTimer = setTimeout(() => notesSave(), 1000);
}

async function notesSave() {
  // Save current editor content to active tab
  if (_notesActiveTab) {
    const tab = _notesTabs.find((t) => t.id === _notesActiveTab);
    if (tab) tab.notes = document.getElementById("notes-editor").value;
  }

  const data = await apiFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify({ notesTabs: _notesTabs }),
  });

  if (data) {
    document.getElementById("notes-status").textContent = `Saved at ${new Date().toLocaleTimeString()}`;
  }
}
