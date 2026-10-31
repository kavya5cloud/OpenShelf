/* Reservations — student/faculty queue & pickup holds */
(function () {
  const me = OS.requireAuth(['student', 'faculty']);
  if (!me) return;
  OS.shell('reservations');
  const $ = OS.$, esc = OS.esc;

  const LABEL = { fulfilled: ['green', 'Collected'], cancelled: ['gray', 'Cancelled'], expired: ['red', 'Expired'] };

  async function render() {
    const s = await OS.api.memberSummary(me.id);
    const active = s.reservations.filter((r) => r.status === 'ready' || r.status === 'waiting')
      .sort((a, b) => (a.status === 'ready' ? 0 : 1) - (b.status === 'ready' ? 0 : 1));
    const past = s.reservations.filter((r) => !(r.status === 'ready' || r.status === 'waiting'));

    $('#list').innerHTML = active.length ? active.map((r) => `
      <article class="card" style="flex-direction:row;align-items:center;flex-wrap:wrap;padding:20px">
        ${OS.cover(r.book)}
        <div style="flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:6px">
          <h2 style="font-size:17px">${esc(r.book.title)}</h2>
          <span class="muted" style="font-size:14px">${esc(r.book.author)} · Reserved ${OS.fmtDate(r.date)}</span>
          ${r.status === 'ready'
            ? '<span class="badge green" style="align-self:flex-start">Ready for pickup</span>'
            : '<span class="badge amber" style="align-self:flex-start">Waiting in queue</span>'}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px">
          <b style="font-size:15px;color:${r.status === 'ready' ? 'var(--success)' : 'var(--text)'}">${r.status === 'ready' ? 'Collect by ' + OS.fmtDate(r.holdUntil) : '#' + r.position + ' in queue'}</b>
          <button class="btn btn-danger btn-sm" type="button" data-cancel="${r.id}">Cancel</button>
        </div>
      </article>`).join('') : `<div class="empty">No active reservations. <a href="catalog.html">Browse the catalog</a> to reserve a book.</div>`;

    $('#past').innerHTML = past.length ? past.map((r) => `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:14px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span><b>${esc(r.book.title)}</b><br><span class="muted" style="font-size:13px">${OS.fmtDate(r.date)}</span></span>
        <span class="badge ${LABEL[r.status][0]}">${LABEL[r.status][1]}</span>
      </div>`).join('') : '<p class="muted" style="font-size:14px">Nothing here yet.</p>';

    OS.$$('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await OS.confirm('Cancel reservation?', 'You will lose your place in the queue.', 'Yes, cancel', true))) return;
      try { await OS.api.cancelReservation(btn.dataset.cancel, me.id); OS.toast('Reservation cancelled.', 'success'); render(); }
      catch (e) { OS.toast(e.message, 'error'); }
    }));
  }
  render().catch((e) => OS.toast(e.message, 'error'));
})();
