/* ── Payments tab: donors, dues, everything Stripe has taken ── */

var _payData = null;

function money(cents, currency) {
  const amount = (cents || 0) / 100;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  });
}

async function payLoad() {
  const data = await apiFetch("/api/payments");
  if (!data) return;
  _payData = data;

  const donationTotal =
    (data.totals || []).find((t) => t.kind === "donation")?.total || 0;
  const grandTotal = (data.totals || []).reduce((s, t) => s + (t.total || 0), 0);

  document.getElementById("pay-stat-donations").textContent = money(donationTotal);
  document.getElementById("pay-stat-mrr").textContent = money(data.collective?.mrr || 0);
  document.getElementById("pay-stat-members").textContent =
    `${data.collective?.monthly_members || 0} / ${data.collective?.annual_members || 0}`;
  document.getElementById("pay-stat-total").textContent = money(grandTotal);

  payRenderDonors();
  payRenderAll();
}

function payRenderDonors() {
  const body = document.getElementById("pay-donors-body");
  const donors = _payData?.donors || [];
  if (!donors.length) {
    body.innerHTML =
      '<tr><td colspan="5" class="empty-state">No donations recorded yet. Try "Sync from Stripe".</td></tr>';
    return;
  }
  body.innerHTML = donors
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.name || "—")}</td>
        <td>${escapeHtml(d.email)}</td>
        <td><strong>${money(d.total)}</strong></td>
        <td>${d.count}</td>
        <td>${d.last_at ? new Date(d.last_at).toLocaleDateString() : ""}</td>
      </tr>`
    )
    .join("");
}

function payRenderAll() {
  const body = document.getElementById("pay-all-body");
  const filter = document.getElementById("pay-filter").value;
  let rows = _payData?.payments || [];
  if (filter) rows = rows.filter((p) => p.kind === filter);
  if (!rows.length) {
    body.innerHTML =
      '<tr><td colspan="6" class="empty-state">Nothing here yet. Try "Sync from Stripe".</td></tr>';
    return;
  }
  body.innerHTML = rows
    .map(
      (p) => `<tr>
        <td>${new Date(p.created_at).toLocaleDateString()}</td>
        <td>${escapeHtml(p.name || "—")}</td>
        <td>${escapeHtml(p.email || "—")}</td>
        <td>${escapeHtml(p.description || "—")}</td>
        <td><span class="status">${escapeHtml(p.kind)}</span></td>
        <td><strong>${money(p.amount, p.currency)}</strong></td>
      </tr>`
    )
    .join("");
}

async function paySync() {
  const btn = document.getElementById("pay-sync-btn");
  btn.disabled = true;
  btn.textContent = "Syncing…";
  const data = await apiFetch("/api/payments", { method: "POST" });
  btn.disabled = false;
  btn.textContent = "Sync from Stripe";
  if (data) {
    showToast(`Synced ${data.imported} payments from Stripe.`, "success");
    payLoad();
  }
}
