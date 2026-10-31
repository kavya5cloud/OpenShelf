/* Issue / Return — librarian only */
(function () {
  const me = OS.requireAuth(['librarian']);
  if (!me) return;
  OS.shell('issue');
  const $ = OS.$, esc = OS.esc;
  const params = new URLSearchParams(location.search);

  // ---------- tabs ----------
  function setTab(mode) {
    const issue = mode === 'issue';
    $('#tabIssue').setAttribute('aria-selected', String(issue));
    $('#tabReturn').setAttribute('aria-selected', String(!issue));
    $('#issuePanel').hidden = !issue;
    $('#returnPanel').hidden = issue;
    $('#issuePanel').style.display = issue ? '' : 'none';
    $('#returnPanel').style.display = issue ? 'none' : 'flex';
  }
  $('#tabIssue').addEventListener('click', () => setTab('issue'));
  $('#tabReturn').addEventListener('click', () => setTab('return'));

  // ---------- autocomplete lists ----------
  async function fillLists() {
    const members = await OS.api.listMembers();
    $('#memberList').innerHTML = members.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} (${OS.roleLabel(m.role)})</option>`).join('');
    const books = await OS.api.listBooks();
    $('#bookList').innerHTML = books.map((b) => `<option value="${esc(b.id)}">${esc(b.title)} — ${b.available} available</option>`).join('');
  }

  // ---------- issue previews ----------
  async function previewMember() {
    const id = $('#iMember').value.trim();
    const box = $('#memberPreview');
    if (!id) { box.innerHTML = '<div class="empty">Member details will appear here.</div>'; return; }
    try {
      const m = await OS.api.getMember(id);
      const blocked = m.issuedCount >= m.limit ? `Book limit reached (${m.limit})` : m.overdueCount ? `${m.overdueCount} overdue book(s)` : m.unpaidFine ? `Unpaid fine ${OS.money(m.unpaidFine)}` : '';
      box.innerHTML = `
        <div class="card" style="flex-direction:row;align-items:center;gap:14px;padding:20px">
          <span class="avatar lg">${esc(OS.initials(m.name))}</span>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
            <b style="font-size:16px">${esc(m.name)}</b>
            <span class="muted" style="font-size:13px">${OS.roleLabel(m.role)} · ${esc(m.dept)} · ${m.issuedCount} of ${m.limit} books issued</span>
          </div>
          <span class="badge ${blocked ? 'red' : 'green'}">${blocked ? esc(blocked) : 'Can borrow'}</span>
        </div>`;
    } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  async function previewBook() {
    const id = $('#iBook').value.trim();
    const box = $('#bookPreview');
    if (!id) { box.innerHTML = '<div class="empty">Book details will appear here.</div>'; return; }
    try {
      const b = await OS.api.getBook(id);
      let due = '';
      try {
        const m = await OS.api.getMember($('#iMember').value.trim());
        due = `<div class="notice blue"><span style="color:var(--primary)">${OS.icon('calendar', 20)}</span><div><div class="t">Due on ${OS.fmtDate(OS.toISO(OS.addDays(OS.today(), m.loanDays)))}</div><small>${m.loanDays}-day loan for ${OS.roleLabel(m.role).toLowerCase()}s</small></div></div>`;
      } catch (e) { /* member not chosen yet */ }
      box.innerHTML = `
        <div class="card" style="padding:20px">
          <div style="display:flex;gap:14px;align-items:center">
            ${OS.cover(b, 'sm')}
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
              <b style="font-size:16px">${esc(b.title)}</b>
              <span class="muted" style="font-size:13px">${esc(b.author)} · Shelf ${esc(b.shelf)}</span>
            </div>
            <span class="badge ${b.available > 0 ? 'green' : 'red'}">${b.available > 0 ? b.available + ' available' : 'None free'}</span>
          </div>
          ${due}
        </div>`;
    } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  $('#iMember').addEventListener('input', OS.debounce(() => { previewMember(); previewBook(); }, 200));
  $('#iBook').addEventListener('input', OS.debounce(previewBook, 200));

  $('#issueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#issueError');
    err.hidden = true;
    const mid = $('#iMember').value.trim(), bid = $('#iBook').value.trim();
    if (!mid || !bid) { err.textContent = 'Enter both member ID and book ID.'; err.hidden = false; return; }
    try {
      const tx = await OS.api.issueBook(mid, bid);
      OS.toast(`Issued "${tx.book.title}" to ${tx.user.name}. Due ${OS.fmtDate(tx.dueDate)}.`, 'success');
      $('#iBook').value = '';
      previewMember(); previewBook(); fillLists();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  // ---------- return ----------
  async function showLoans(id) {
    const box = $('#returnList');
    if (!id) { box.innerHTML = ''; return; }
    try {
      const m = await OS.api.getMember(id);
      const loans = await OS.api.activeLoans(id);
      box.innerHTML = `
        <section class="card">
          <div class="card-head">
            <div style="display:flex;align-items:center;gap:12px"><span class="avatar">${esc(OS.initials(m.name))}</span><div><b>${esc(m.name)}</b><div class="muted" style="font-size:13px">${OS.roleLabel(m.role)} · ${esc(m.id)}</div></div></div>
            ${m.unpaidFine ? `<button class="btn btn-accent btn-sm" type="button" id="collectBtn">${OS.icon('rupee', 16)}Collect old fine ${OS.money(m.unpaidFine)}</button>` : ''}
          </div>
          ${loans.length ? loans.map((t) => `
            <div class="list-item ${t.overdue ? 'warn' : ''}">
              ${OS.cover(t.book, 'sm')}
              <div class="info"><b>${esc(t.book.title)}</b><span class="muted" style="font-size:13px">Issued ${OS.fmtDate(t.issueDate)} · Due ${OS.fmtDate(t.dueDate)}</span></div>
              <div style="display:flex;flex-direction:column;gap:2px;min-width:130px">
                <b style="color:${t.overdue ? 'var(--warn)' : 'var(--text)'}">${OS.dueText(t)}</b>
                <span style="font-size:13px;color:${t.fine ? 'var(--warn)' : 'var(--muted)'}">${t.fine ? `Fine ${OS.money(t.fine)} (₹${OS.RULES.finePerDay}/day)` : 'No fine'}</span>
              </div>
              ${t.fine ? `<label class="check"><input type="checkbox" data-paid="${t.id}" checked>Fine paid now</label>` : ''}
              <button class="btn btn-primary btn-sm" type="button" data-return="${t.id}">Return</button>
            </div>`).join('') : '<div class="empty">This member has no books issued right now.</div>'}
        </section>`;
      OS.$$('[data-return]').forEach((btn) => btn.addEventListener('click', async () => {
        const paidBox = $(`[data-paid="${btn.dataset.return}"]`);
        try {
          const tx = await OS.api.returnBook(btn.dataset.return, { finePaid: paidBox ? paidBox.checked : true });
          OS.toast(`Returned "${tx.book.title}".${tx.fine ? ` Fine ${OS.money(tx.fine)} ${tx.finePaid ? 'collected' : 'added to dues'}.` : ''}`, 'success');
          showLoans(id); fillLists();
        } catch (e) { OS.toast(e.message, 'error'); }
      }));
      const cb = $('#collectBtn');
      if (cb) cb.addEventListener('click', async () => {
        try { const r = await OS.api.payFines(m.id); OS.toast(`Collected ${OS.money(r.amount)}.`, 'success'); showLoans(id); } catch (e) { OS.toast(e.message, 'error'); }
      });
    } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  $('#returnForm').addEventListener('submit', (e) => { e.preventDefault(); showLoans($('#rMember').value.trim()); });

  // ---------- start ----------
  fillLists();
  previewMember(); previewBook();
  if (params.get('member')) {
    $('#rMember').value = params.get('member');
    setTab('return');
    showLoans(params.get('member'));
  } else setTab('issue');
})();
