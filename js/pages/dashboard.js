/* Dashboard — one page, two layouts: librarian vs student/faculty */
(function () {
  const me = OS.requireAuth();
  if (!me) return;
  OS.shell('dashboard');
  const $ = OS.$, esc = OS.esc;
  const content = $('#content');

  const stat = (icon, color, label, value, note, noteClass = '') => `
    <div class="stat"><span class="icon ${color}">${OS.icon(icon, 22)}</span>
      <div class="body"><span class="label">${label}</span><span class="value">${value}</span><span class="note ${noteClass}">${note}</span></div></div>`;

  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  // ---------------- Librarian ----------------
  async function librarian() {
    const d = await OS.api.dashboard();
    const fineTotal = d.overdue.reduce((s, t) => s + t.fine, 0);
    content.innerHTML = `
      <div class="page-head">
        <div class="titles"><h1>${greeting()}!</h1><p class="muted">Here's what's happening in the library today.</p></div>
        <div class="actions">
          <a class="btn btn-outline" href="catalog.html?add=1">${OS.icon('plus', 18)}Add book</a>
          <a class="btn btn-primary" href="issue-return.html">${OS.icon('swap', 18)}Issue / Return</a>
        </div>
      </div>
      <section class="grid stats" aria-label="Summary">
        ${stat('book', '', 'Books in library', d.totalBooks.toLocaleString('en-IN'), `${d.titles} titles · ${d.members} members`)}
        ${stat('swap', 'amber', 'Issued today', d.issuedToday, `${d.returnedToday} returned today · ${d.onLoan} on loan`)}
        ${stat('alert', 'red', 'Overdue', d.overdue.length, d.overdue.length ? `${OS.money(fineTotal)} in fines building up` : 'All books on time', d.overdue.length ? 'error-text' : '')}
        ${stat('rupee', 'green', 'Fines collected', OS.money(d.finesThisMonth), 'This month')}
      </section>
      <div class="row">
        <section class="card grow-2" aria-labelledby="recentH">
          <div class="card-head"><h2 id="recentH">Recent activity</h2><a href="reports.html" style="font-size:14px;font-weight:600">View reports</a></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Book</th><th>Member</th><th>Type</th><th>Date</th></tr></thead>
            <tbody>${d.recent.map((t) => `
              <tr>
                <td><div class="cell-book">${OS.cover(t.book, 'sm')}<b>${esc(t.book.title)}</b></div></td>
                <td>${esc(t.user.name)}<div class="muted" style="font-size:13px">${OS.roleLabel(t.user.role)} · ${esc(t.user.id)}</div></td>
                <td><span class="badge ${t.type === 'Issued' ? 'blue' : 'green'}">${t.type}</span></td>
                <td class="muted">${OS.fmtDate(t.when)}</td>
              </tr>`).join('')}</tbody>
          </table></div>
        </section>
        <div class="grow-1" style="display:flex;flex-direction:column;gap:20px;min-width:0">
          <section class="card" aria-labelledby="overdueH">
            <div class="card-head"><h2 id="overdueH">Overdue books</h2><span class="badge red">${d.overdue.length}</span></div>
            ${d.overdue.length ? d.overdue.slice(0, 5).map((t) => `
              <div class="list-item warn">
                <div class="info"><b style="font-size:14px">${esc(t.book.title)}</b><span class="muted" style="font-size:13px">${esc(t.user.name)} · ${esc(t.user.id)}</span></div>
                <div style="text-align:right"><b style="color:var(--warn)">${OS.money(t.fine)}</b><div style="font-size:12px;color:var(--warn)">${OS.dueText(t)}</div></div>
              </div>`).join('') : '<div class="empty">No overdue books. Everything is on time.</div>'}
            ${d.overdue.length ? '<button class="btn btn-outline" type="button" id="remindBtn">' + OS.icon('bell', 18) + 'Send reminders</button>' : ''}
          </section>
          <section class="card" aria-labelledby="holdH">
            <div class="card-head"><h2 id="holdH">Ready for pickup</h2><span class="badge amber">${d.readyReservations.length}</span></div>
            ${d.readyReservations.length ? d.readyReservations.map((r) => `
              <div class="list-item">
                <div class="info"><b style="font-size:14px">${esc(r.book ? r.book.title : r.bookId)}</b><span class="muted" style="font-size:13px">For ${esc(r.user.name)} · until ${OS.fmtDate(r.holdUntil)}</span></div>
              </div>`).join('') : `<p class="muted" style="font-size:14px">No reserved books waiting at the desk. ${d.waitingReservations} member(s) in reservation queues.</p>`}
          </section>
        </div>
      </div>`;
    const rb = $('#remindBtn');
    if (rb) rb.addEventListener('click', async () => {
      rb.disabled = true;
      try {
        const r = await OS.api.sendReminders();
        OS.toast(`Reminder sent to ${r.sent} member(s).`, 'success');
      } catch (e) {
        OS.toast(e.message, 'error');
        rb.disabled = false;
      }
    });
  }

  // ---------------- Student / Faculty ----------------
  async function member() {
    const s = await OS.api.memberSummary(me.id);
    const popular = (await OS.api.listBooks({ sort: 'popular' })).slice(0, 4);
    const next = s.issued[0];
    const ready = s.reservations.filter((r) => r.status === 'ready');
    const waiting = s.reservations.filter((r) => r.status === 'waiting');
    // Auto due-date reminders (computed, not stored)
    const dueSoon = s.issued.filter((t) => t.daysLeft >= 0 && t.daysLeft <= 2);

    content.innerHTML = `
      <section class="hero">
        <h1 style="font-size:30px">Hi ${esc(me.name.replace(/^(Dr\.|Prof\.)\s*/, '').split(' ')[0])}, what are you reading next?</h1>
        <form role="search" action="catalog.html" style="display:flex;gap:10px;flex-wrap:wrap">
          <label for="q" class="sr-only">Search books</label>
          <input class="input" id="q" name="q" type="search" placeholder="Search by title, author or ISBN" style="flex:1 1 320px;height:52px;border:0;font-size:16px">
          <button class="btn btn-accent" style="height:52px;padding:0 26px" type="submit">${OS.icon('search', 18)}Search</button>
        </form>
      </section>

      <section class="grid stats" aria-label="My summary">
        ${stat('library', '', 'Books issued', `${s.stats.issuedCount} / ${s.stats.limit}`, `You can borrow ${Math.max(0, s.stats.limit - s.stats.issuedCount)} more`)}
        ${stat('calendar', 'amber', 'Next due date', next ? OS.fmtDate(next.dueDate).replace(/ \d{4}$/, '') : '—', next ? OS.dueText(next) : 'Nothing issued', next && next.daysLeft <= 2 ? 'error-text' : '')}
        ${stat('rupee', s.stats.totalDue ? 'red' : 'green', 'Fines due', OS.money(s.stats.totalDue), s.stats.totalDue ? 'Pay at the library desk' : 'All clear')}
        ${stat('bookmark', '', 'Reservations', ready.length + waiting.length, ready.length ? `${ready.length} ready for pickup` : waiting.length ? `${waiting.length} in queue` : 'None yet')}
      </section>

      <div class="row">
        <section class="card grow-2" aria-labelledby="mineH">
          <div class="card-head"><h2 id="mineH">My issued books</h2><a href="my-books.html" style="font-size:14px;font-weight:600">History & fines</a></div>
          ${s.issued.length ? s.issued.map((t) => `
            <div class="list-item ${t.overdue ? 'warn' : ''}">
              ${OS.cover(t.book, 'sm')}
              <div class="info"><b>${esc(t.book.title)}</b><span class="muted" style="font-size:14px">${esc(t.book.author)}</span></div>
              <div style="display:flex;flex-direction:column;gap:2px;min-width:150px">
                <span class="muted" style="font-size:13px">Due ${OS.fmtDate(t.dueDate)}</span>
                <b style="font-size:14px;color:${t.overdue ? 'var(--warn)' : t.daysLeft <= 2 ? 'var(--warn)' : 'var(--text)'}">${OS.dueText(t)}${t.fine ? ' · ' + OS.money(t.fine) : ''}</b>
              </div>
              <button class="btn btn-outline btn-sm" type="button" data-renew="${t.id}" ${t.overdue || t.renewals >= OS.RULES.maxRenewals ? 'disabled' : ''}>${t.renewals >= OS.RULES.maxRenewals ? 'Renewed' : 'Renew'}</button>
            </div>`).join('') : `<div class="empty">You have no books right now. <a href="catalog.html">Browse the catalog</a></div>`}
        </section>
        <section class="card grow-1" aria-labelledby="notifH">
          <div class="card-head"><h2 id="notifH">Notifications</h2></div>
          ${dueSoon.map((t) => `<div class="notice amber"><span style="color:var(--warn)">${OS.icon('clock', 20)}</span><div><div class="t">"${esc(t.book.title)}" is ${OS.dueText(t).toLowerCase()}</div><small>Return or renew it to avoid a fine</small></div></div>`).join('')}
          ${ready.map((r) => `<div class="notice green"><span style="color:var(--success)">${OS.icon('check', 20)}</span><div><div class="t">"${esc(r.book.title)}" is ready for pickup</div><small>Collect by ${OS.fmtDate(r.holdUntil)}</small></div></div>`).join('')}
          ${s.notifications.slice(0, 4).map((n) => `<div class="notice ${n.type === 'success' ? 'green' : n.type === 'warn' ? 'amber' : 'blue'}"><span style="color:var(--primary)">${OS.icon('bell', 20)}</span><div><div class="t">${esc(n.text)}</div><small>${OS.fmtDate(n.date)}</small></div></div>`).join('')}
          ${!dueSoon.length && !ready.length && !s.notifications.length ? '<p class="muted">You\'re all caught up.</p>' : ''}
        </section>
      </div>

      <section style="display:flex;flex-direction:column;gap:16px" aria-labelledby="popH">
        <div class="card-head"><h2 id="popH">Popular on campus</h2><a href="catalog.html?sort=popular" style="font-size:14px;font-weight:600">Browse catalog</a></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
          ${popular.map((b) => `
            <a href="catalog.html?q=${encodeURIComponent(b.title)}" class="card" style="padding:16px;gap:10px;text-decoration:none;color:inherit">
              ${OS.cover(b, 'lg')}
              <b style="font-size:15px">${esc(b.title)}</b>
              <span class="muted" style="font-size:13px">${esc(b.author)}</span>
              <span class="badge ${b.available > 0 ? 'green' : 'red'}" style="align-self:flex-start">${b.available > 0 ? b.available + ' available' : 'All issued'}</span>
            </a>`).join('')}
        </div>
      </section>`;

    OS.$$('[data-renew]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        const tx = await OS.api.renew(btn.dataset.renew, me.id);
        OS.toast(`Renewed! New due date: ${OS.fmtDate(tx.dueDate)}`, 'success');
        member();
      } catch (e) { OS.toast(e.message, 'error'); }
    }));
    OS.api.markNotificationsRead(me.id);
  }

  (me.role === 'librarian' ? librarian() : member()).catch((e) => OS.toast(e.message, 'error'));
})();
