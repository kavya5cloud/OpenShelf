/* Members — librarian view of students & faculty with loans and dues */
(function () {
  const me = OS.requireAuth(['librarian']);
  if (!me) return;
  OS.shell('members');
  const $ = OS.$, esc = OS.esc;
  const state = { q: '', role: 'All', duesOnly: false };
  $('#searchIcon').outerHTML = OS.icon('search', 18);

  async function render() {
    let list = await OS.api.listMembers(state);
    if (state.duesOnly) list = list.filter((m) => m.totalDue > 0);
    $('#countText').textContent = `${list.length} member${list.length === 1 ? '' : 's'} shown`;
    $('#table').innerHTML = list.length ? `
      <table>
        <thead><tr><th>Member</th><th>Role</th><th>Department</th><th class="num">Books</th><th class="num">Overdue</th><th class="num">Dues</th><th></th></tr></thead>
        <tbody>${list.map((m) => `
          <tr>
            <td><div class="cell-book"><span class="avatar">${esc(OS.initials(m.name))}</span><div><b>${esc(m.name)}</b><span class="muted" style="font-size:13px">${esc(m.id)} · ${esc(m.email)}</span></div></div></td>
            <td><span class="badge ${m.role === 'faculty' ? 'amber' : 'blue'}">${OS.roleLabel(m.role)}</span></td>
            <td class="muted">${esc(m.dept)}</td>
            <td class="num">${m.issuedCount} / ${m.limit}</td>
            <td class="num" style="${m.overdueCount ? 'color:var(--warn);font-weight:700' : ''}">${m.overdueCount || '—'}</td>
            <td class="num" style="${m.totalDue ? 'color:var(--danger);font-weight:700' : ''}">${m.totalDue ? OS.money(m.totalDue) : '—'}</td>
            <td class="num" style="white-space:nowrap">
              ${m.unpaidFine ? `<button class="btn btn-accent btn-sm" type="button" data-pay="${esc(m.id)}">Collect ${OS.money(m.unpaidFine)}</button>` : ''}
              ${m.issuedCount ? `<a class="btn btn-outline btn-sm" href="issue-return.html?member=${encodeURIComponent(m.id)}">Return books</a>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty" style="margin:12px 0">No members match.</div>';

    OS.$$('[data-pay]').forEach((btn) => btn.addEventListener('click', async () => {
      try { const r = await OS.api.payFines(btn.dataset.pay); OS.toast(`Collected ${OS.money(r.amount)}.`, 'success'); render(); }
      catch (e) { OS.toast(e.message, 'error'); }
    }));
  }

  $('#q').addEventListener('input', OS.debounce(() => { state.q = $('#q').value; render(); }, 150));
  OS.$$('#roleFilter button').forEach((b) => b.addEventListener('click', () => {
    state.role = b.dataset.role;
    OS.$$('#roleFilter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  $('#duesOnly').addEventListener('change', () => { state.duesOnly = $('#duesOnly').checked; render(); });
  render().catch((e) => OS.toast(e.message, 'error'));
})();
