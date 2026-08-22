/* ── Collective tab: member admin, invites, reports ── */

async function colLoad() {
  const data = await apiFetch("/api/community/admin-members");
  if (!data) return;

  const body = document.getElementById("col-members-body");
  const members = data.members || [];
  if (!members.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">No members yet.</td></tr>';
  } else {
    body.innerHTML = members.map((m) => {
      const plan = m.comped
        ? "comped"
        : `${m.plan || "?"}${m.subscription_status && m.subscription_status !== "active" ? ` (${m.subscription_status})` : ""}`;
      const suspended = m.status === "suspended";
      return `<tr${suspended ? ' style="opacity:.55;"' : ""}>
        <td>${escapeHtml(m.name || "—")}${m.role === "admin" ? ' <span class="badge">admin</span>' : ""}</td>
        <td>${escapeHtml(m.email)}</td>
        <td>${escapeHtml(m.location || "—")}</td>
        <td>${escapeHtml(plan)}</td>
        <td>${m.joined_at ? new Date(m.joined_at).toLocaleDateString() : ""}</td>
        <td>${m.last_seen_at ? new Date(m.last_seen_at).toLocaleDateString() : "never"}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="colSendLink('${m.id}')">Send login link</button>
          ${suspended
            ? `<button class="btn btn-secondary btn-sm" onclick="colAction('${m.id}','reactivate')">Reactivate</button>`
            : `<button class="btn btn-danger btn-sm" onclick="colSuspend('${m.id}', '${escapeHtml(m.name || m.email)}')">Suspend</button>`}
        </td>
      </tr>`;
    }).join("");
  }

  const reportsEl = document.getElementById("col-reports");
  const reports = data.reports || [];
  if (!reports.length) {
    reportsEl.innerHTML = '<p class="empty-state">No open reports.</p>';
  } else {
    reportsEl.innerHTML = reports.map((r) => `
      <div class="campaign-item">
        <div>
          <strong>${escapeHtml(r.reporter_name || "Someone")}</strong> reported a ${escapeHtml(r.target_type || "post")}
          <div style="font-size:12px;color:var(--gray-400);">${escapeHtml(r.reason || "")}</div>
          <div style="font-size:12px;color:var(--gray-500);">${r.created_at ? new Date(r.created_at).toLocaleString() : ""}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="colResolveReport('${r.id}')">Resolve</button>
      </div>
    `).join("");
  }
}

async function colInvite() {
  const email = document.getElementById("col-invite-email").value.trim();
  const name = document.getElementById("col-invite-name").value.trim();
  if (!email) { showToast("An email is required.", "error"); return; }

  const data = await apiFetch("/api/community/admin-members", {
    method: "POST",
    body: JSON.stringify({ email, name }),
  });
  if (!data) return;

  showToast(data.created ? "Member added (comped)." : "Already a member — reactivated.", "success");
  document.getElementById("col-invite-email").value = "";
  document.getElementById("col-invite-name").value = "";
  colLoad();
}

async function colAction(id, action) {
  const data = await apiFetch("/api/community/admin-members", {
    method: "PUT",
    body: JSON.stringify({ id, action }),
  });
  if (data) colLoad();
}

function colSuspend(id, label) {
  openModal(
    "Suspend member",
    `Suspend ${label}? They are signed out everywhere immediately and lose access until reactivated. Their posts stay.`,
    () => colAction(id, "suspend")
  );
}

async function colSendLink(id) {
  const data = await apiFetch("/api/community/admin-members", {
    method: "PUT",
    body: JSON.stringify({ id, action: "send_login_link" }),
  });
  if (data) showToast("Sign-in link sent.", "success");
}

async function colResolveReport(reportId) {
  const data = await apiFetch("/api/community/admin-members", {
    method: "DELETE",
    body: JSON.stringify({ report_id: reportId }),
  });
  if (data) { showToast("Report resolved.", "success"); colLoad(); }
}
