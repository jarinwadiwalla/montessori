/* ── Collective tab: member admin, invites, reports ── */

async function colLoad() {
  colLoadEvents();
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
          <button class="btn btn-secondary btn-sm" onclick="colResendWelcome('${m.id}', '${escapeHtml(m.name || m.email)}')">Resend welcome</button>
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

// ---- events -------------------------------------------------

async function colLoadEvents() {
  const data = await apiFetch("/api/community/events?when=upcoming");
  if (!data) return;
  const wrap = document.getElementById("col-events");
  const events = data.events || [];
  if (!events.length) {
    wrap.innerHTML = '<p class="empty-state">No upcoming events.</p>';
    return;
  }
  wrap.innerHTML = events.map((e) => `
    <div class="campaign-item"${e.status === "cancelled" ? ' style="opacity:.55;"' : ""}>
      <div>
        <strong>${escapeHtml(e.title)}</strong>
        ${e.status === "cancelled" ? '<span class="badge">cancelled</span>' : ""}
        <div style="font-size:12px;color:var(--gray-500);">
          ${new Date(e.starts_at).toLocaleString()} · ${escapeHtml(e.kind)} · ${e.rsvp_count} going${e.capacity ? ` / ${e.capacity}` : ""}
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn btn-secondary btn-sm" onclick="colShowRsvps('${e.id}')">Who's coming</button>
        ${e.status === "cancelled" ? "" : `<button class="btn btn-danger btn-sm" onclick="colCancelEvent('${e.id}', '${escapeHtml(e.title)}')">Cancel event</button>`}
      </div>
    </div>
    <div id="rsvps-${e.id}" style="display:none;"></div>
  `).join("");
}

// Who has RSVP'd, with their emails, so a joining link can be sent out.
// Members' emails are shown nowhere else; this is admin-only by design.
async function colShowRsvps(eventId) {
  const box = document.getElementById(`rsvps-${eventId}`);
  if (!box) return;

  if (box.style.display === "block") {
    box.style.display = "none";
    return;
  }

  box.style.display = "block";
  box.innerHTML = '<p class="empty-state">Loading…</p>';

  const data = await apiFetch(
    `/api/community/admin-event-rsvps?event_id=${encodeURIComponent(eventId)}`
  );
  if (!data) return;

  if (!data.count) {
    box.innerHTML = '<p class="empty-state">Nobody has RSVP\'d yet.</p>';
    return;
  }

  const rows = data.going
    .map(
      (g) => `<tr>
        <td>${escapeHtml(g.name)}</td>
        <td>${escapeHtml(g.email)}</td>
        <td style="color:var(--gray-500);">${new Date(g.rsvped_at).toLocaleDateString()}</td>
      </tr>`
    )
    .join("");

  box.innerHTML = `
    <div class="card" style="margin:8px 0 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;">
        <strong>${data.count} coming</strong>
        <button class="btn btn-secondary btn-sm" onclick="colCopyRsvpEmails('${eventId}')">Copy all emails</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>RSVP'd</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <textarea id="rsvp-emails-${eventId}" readonly rows="2"
        class="form-input" style="margin-top:8px;font-size:12px;"
      >${escapeHtml(data.emails)}</textarea>
      <p style="font-size:12px;color:var(--gray-500);margin-top:6px;">
        Paste these into the <strong>Bcc</strong> field so members can't see each other's addresses.
      </p>
    </div>
  `;
}

function colCopyRsvpEmails(eventId) {
  const field = document.getElementById(`rsvp-emails-${eventId}`);
  if (!field) return;
  field.select();
  navigator.clipboard
    .writeText(field.value)
    .then(() => showToast("Emails copied", "success"))
    .catch(() => showToast("Select the box and copy manually", "error"));
}

async function colAddEvent() {
  const starts = document.getElementById("ev-starts").value;
  const ends = document.getElementById("ev-ends").value;
  const data = await apiFetch("/api/community/events", {
    method: "POST",
    body: JSON.stringify({
      kind: document.getElementById("ev-kind").value,
      title: document.getElementById("ev-title").value,
      starts_at: starts ? new Date(starts).toISOString() : "",
      ends_at: ends ? new Date(ends).toISOString() : "",
      timezone_note: document.getElementById("ev-tz").value,
      location: document.getElementById("ev-location").value,
      link: document.getElementById("ev-link").value,
      capacity: Number(document.getElementById("ev-capacity").value) || 0,
      description: document.getElementById("ev-description").value,
    }),
  });
  if (data) {
    showToast("Event added.", "success");
    ["ev-title", "ev-starts", "ev-ends", "ev-tz", "ev-location", "ev-link", "ev-description"].forEach(
      (id) => (document.getElementById(id).value = "")
    );
    document.getElementById("ev-capacity").value = "0";
    colLoadEvents();
  }
}

function colCancelEvent(id, title) {
  openModal(
    "Cancel event",
    `Cancel "${title}"? Members who RSVP'd will see it marked as cancelled.`,
    async () => {
      const data = await apiFetch("/api/community/events", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      if (data) { showToast("Event cancelled.", "success"); colLoadEvents(); }
    }
  );
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

  showToast(
    data.created
      ? data.emailed
        ? "Member added and welcome email sent."
        : "Member added, but the welcome email did not send — use Send login link."
      : "Already a member — reactivated.",
    data.created && !data.emailed ? "error" : "success"
  );
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

// The full welcome, not just a link. For anyone added before the welcome
// was wired into the invite step, or who lost the original.
async function colResendWelcome(id, who) {
  if (!confirm(`Send the welcome email to ${who} again?\n\nIt explains what the Collective is, that their membership is free, and carries a fresh sign-in link valid for 20 minutes.`)) return;
  const data = await apiFetch("/api/community/admin-members", {
    method: "PUT",
    body: JSON.stringify({ id, action: "resend_welcome" }),
  });
  if (data) showToast("Welcome email sent.", "success");
}

async function colResolveReport(reportId) {
  const data = await apiFetch("/api/community/admin-members", {
    method: "DELETE",
    body: JSON.stringify({ report_id: reportId }),
  });
  if (data) { showToast("Report resolved.", "success"); colLoad(); }
}
