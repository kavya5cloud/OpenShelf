/* My Books — student/faculty loans, renewals, history, fines */
(function () {
  const me = OS.requireAuth(['student', 'faculty']);
  if (!me) return;
  OS.shell('mybooks');
  const $ = OS.$, esc = OS.esc;

  async function render() {
    const s = await OS.api.memberSummary(me.id);
    const unpaid = s.history.filter((t) => t.fine > 0 && !t.finePaid);
    const paidTotal = s.history.filter((t) => t.fine > 0 && t.finePaid).reduce((a, t) => a + t.fine, 0);
    $('#renewHint').textContent = `Loan: ${s.stats.loanDays} days · Renew once if nobody has reserved it`;

    $('#stats').innerHTML = [
      ['library', '', 'Issued now', `${s.stats.issuedCount} / ${s.stats.limit}`, `${OS.roleLabel(me.role)} limit`],
      ['book', '', 'Total borrowed', s.stats.totalBorrowed, 'Since you joined'],
      ['alert', s.stats.totalDue ? 'red' : 'green', 'Fines due', OS.money(s.stats.totalDue), s.stats.accruingFine ? `${OS.money(s.stats.accruingFine)} still growing on overdue books` : unpaid.length ? 'Pay at the library desk' : 'All clear'],
      ['rupee', 'amber', 'Fines paid', OS.money(paidTotal), 'Lifetime']
    ].map(([ic, c, l, v, n]) => `<div class="stat"><span class="icon ${c}">${OS.icon(ic, 22)}</span><div class="body"><span class="label">${l}</span><span class="value">${v}</span><span class="note">${n}</span></div></div>`).join('');

    $('#current').innerHTML = s.issued.length ? s.issued.map((t) => {
      const canRenew = !t.overdue && t.renewals < OS.RULES.maxRenewals;
      return `
      <div class="list-item ${t.overdue ? 'warn' : ''}">
        ${OS.cover(t.book, 'sm')}
        <div class="info"><b>${esc(t.book.title)}</b><span class="muted" style="font-size:13px">${esc(t.book.author)} · Issued ${OS.fmtDate(t.issueDate)}</span></div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:150px">
          <span class="muted" style="font-size:13px">Due ${OS.fmtDate(t.dueDate)}</span>
          <b style="font-size:14px;color:${t.overdue || t.daysLeft <= 2 ? 'var(--warn)' : 'var(--text)'}">${OS.dueText(t)}${t.fine ? ' · ' + OS.money(t.fine) : ''}</b>
        </div>
        <button class="btn btn-outline btn-sm" type="button" data-renew="${t.id}" ${canRenew ? '' : 'disabled'} title="${t.overdue ? 'Overdue books must be returned' : t.renewals ? 'Already renewed once' : 'Extend the due date'}">${t.renewals ? 'Renewed' : 'Renew'}</button>
      </div>`;
    }).join('') : '<div class="empty">No books issued right now. <a href="catalog.html">Find something to read</a></div>';

    $('#history').innerHTML = s.history.length ? `
      <table>
        <thead><tr><th>Book</th><th>Issued</th><th>Returned</th><th class="num">Fine</th><th>Status</th></tr></thead>
        <tbody>${s.history.map((t) => `
          <tr>
            <td><div class="cell-book">${OS.cover(t.book, 'sm')}<div><b>${esc(t.book.title)}</b><span class="muted" style="font-size:13px">${esc(t.book.author)}</span></div></div></td>
            <td class="muted">${OS.fmtDate(t.issueDate)}</td>
            <td class="muted">${OS.fmtDate(t.returnDate)}</td>
            <td class="num">${t.fine ? OS.money(t.fine) : '—'}</td>
            <td>${t.fine === 0 ? '<span class="badge green">On time</span>' : t.finePaid ? '<span class="badge gray">Late · paid</span>' : '<span class="badge red">Fine unpaid</span>'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty">No returned books yet.</div>';

    OS.$$('[data-renew]').forEach((btn) => btn.addEventListener('click', async () => {
      try { const tx = await OS.api.renew(btn.dataset.renew, me.id); OS.toast(`Renewed! New due date: ${OS.fmtDate(tx.dueDate)}`, 'success'); render(); }
      catch (e) { OS.toast(e.message, 'error'); }
    }));
  }
  render().catch((e) => OS.toast(e.message, 'error'));
})();
