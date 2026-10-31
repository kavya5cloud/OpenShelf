/* Reports — librarian analytics, CSV + PDF (print) export */
(function () {
  const me = OS.requireAuth(['librarian']);
  if (!me) return;
  OS.shell('reports');
  const $ = OS.$, esc = OS.esc;
  let period = 'month', current = null;
  const NAMES = { week: 'Last 7 days', month: 'This month', semester: 'Last 6 months' };

  async function render() {
    const r = await OS.api.report(period);
    current = r;
    $('#periodText').textContent = `${NAMES[period]} · from ${OS.fmtDate(r.from)} to today`;
    OS.$$('#periods button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.p === period)));

    $('#kpis').innerHTML = [
      ['swap', '', 'Books issued', r.issued],
      ['check', 'green', 'Books returned', r.returned],
      ['alert', 'red', 'Overdue right now', r.overdueNow],
      ['rupee', 'amber', 'Fines collected', OS.money(r.finesCollected)]
    ].map(([ic, c, l, v]) => `<div class="stat"><span class="icon ${c}">${OS.icon(ic, 22)}</span><div class="body"><span class="label">${l}</span><span class="value">${v}</span></div></div>`).join('');

    const max = Math.max(1, ...r.months.map((m) => m.value));
    $('#bars').innerHTML = r.months.map((m, i) => `
      <div class="col"><span class="v">${m.value}</span><div class="bar ${i === r.months.length - 1 ? 'hl' : ''}" style="height:${Math.round(m.value / max * 200)}px" title="${m.label}: ${m.value} issued"></div></div>`).join('');
    $('#barLabels').innerHTML = r.months.map((m) => `<span>${m.label}</span>`).join('');

    $('#cats').innerHTML = r.categories.length ? r.categories.map((c) => `
      <div class="hbar"><div class="top"><b>${esc(c.label)}</b><span class="muted">${c.count} · ${c.pct}%</span></div><div class="track"><div class="fill" style="width:${c.pct}%"></div></div></div>`).join('')
      : '<p class="muted">No books issued in this period.</p>';

    $('#top').innerHTML = r.top.length ? `
      <table><thead><tr><th>#</th><th>Book</th><th>Category</th><th class="num">Times issued</th></tr></thead>
      <tbody>${r.top.map((t) => `<tr><td class="muted">${t.rank}</td><td><b>${esc(t.title)}</b></td><td class="muted">${esc(t.category)}</td><td class="num"><b>${t.count}</b></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No books issued in this period.</p>';

    $('#fines').innerHTML = `
      <div style="display:flex;justify-content:space-between"><span class="muted">Collected (${NAMES[period].toLowerCase()})</span><b style="color:var(--success)">${OS.money(r.finesCollected)}</b></div>
      <div style="display:flex;justify-content:space-between"><span class="muted">Pending right now</span><b style="color:var(--warn)">${OS.money(r.finesPending)}</b></div>
      <div style="display:flex;justify-content:space-between"><span class="muted">Members with dues</span><b>${r.membersWithDues}</b></div>
      <a href="members.html" class="no-print" style="font-size:14px;font-weight:600">View members with dues</a>`;
  }

  function exportCSV() {
    if (!current) return;
    const head = ['Transaction', 'Book ID', 'Book', 'Category', 'Member ID', 'Member', 'Role', 'Issued', 'Due', 'Returned', 'Fine (INR)', 'Fine paid'];
    const rows = current.rows.map((t) => [t.id, t.book.id, t.book.title, t.book.category, t.user.id, t.user.name, t.user.role, t.issueDate, t.dueDate, t.returnDate || '', t.fine, t.fine ? (t.finePaid ? 'Yes' : 'No') : '']);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `openshelf-report-${period}-${OS.toISO(OS.today())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    OS.toast(`Downloaded ${rows.length} transactions as CSV.`, 'success');
  }

  OS.$$('#periods button').forEach((b) => b.addEventListener('click', () => { period = b.dataset.p; render(); }));
  $('#csvBtn').addEventListener('click', exportCSV);
  $('#pdfBtn').addEventListener('click', () => window.print());
  render().catch((e) => OS.toast(e.message, 'error'));
})();
