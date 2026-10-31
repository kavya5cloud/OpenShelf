/* Catalog — students/faculty search & reserve; librarian also adds, edits, deletes */
(function () {
  const me = OS.requireAuth();
  if (!me) return;
  OS.shell('catalog');
  const $ = OS.$, esc = OS.esc;
  const isLib = me.role === 'librarian';
  const params = new URLSearchParams(location.search);

  const state = { q: params.get('q') || '', sort: params.get('sort') || 'title', category: 'All', availableOnly: false };
  $('#searchIcon').outerHTML = OS.icon('search', 18);
  $('#q').value = state.q;
  $('#sort').value = state.sort;
  if (isLib) {
    $('#pageTitle').textContent = 'Manage books';
    $('#headActions').innerHTML = `<button class="btn btn-primary" type="button" id="addBtn">${OS.icon('plus', 18)}Add book</button>`;
    $('#addBtn').addEventListener('click', () => bookForm());
  }

  let myBooks = new Set(), myRes = new Map();
  async function loadMine() {
    if (isLib) return;
    const s = await OS.api.memberSummary(me.id);
    myBooks = new Set(s.issued.map((t) => t.bookId));
    myRes = new Map(s.reservations.filter((r) => r.status === 'waiting' || r.status === 'ready').map((r) => [r.bookId, r]));
  }

  async function renderCats() {
    const cats = ['All', ...(await OS.api.categories())];
    $('#cats').innerHTML = cats.map((c) => `<button type="button" class="chip" aria-pressed="${c === state.category}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    OS.$$('#cats .chip').forEach((b) => b.addEventListener('click', () => { state.category = b.dataset.cat; renderCats(); render(); }));
  }

  function actionFor(b) {
    if (isLib) {
      return `<div style="display:flex;gap:6px">
        <button class="icon-btn" type="button" data-edit="${b.id}" aria-label="Edit ${esc(b.title)}" title="Edit">${OS.icon('edit', 16)}</button>
        <button class="icon-btn danger" type="button" data-del="${b.id}" aria-label="Delete ${esc(b.title)}" title="Delete">${OS.icon('trash', 16)}</button></div>`;
    }
    if (myBooks.has(b.id)) return '<span class="badge blue">With you</span>';
    const r = myRes.get(b.id);
    if (r) return `<span class="badge amber">${r.status === 'ready' ? 'Ready for pickup' : '#' + r.position + ' in queue'}</span>`;
    return b.available > 0
      ? `<button class="btn btn-primary btn-sm" type="button" data-res="${b.id}">Reserve</button>`
      : `<button class="btn btn-outline btn-sm" type="button" data-res="${b.id}">Join queue</button>`;
  }

  async function render() {
    const books = await OS.api.listBooks(state);
    const total = OS.db().books.length;
    $('#countText').textContent = `Showing ${books.length} of ${total} titles`;
    $('#grid').innerHTML = books.length ? books.map((b) => `
      <article class="book-card">
        ${OS.cover(b)}
        <div class="info">
          <span class="cat">${esc(b.category)}</span>
          <h3>${esc(b.title)}</h3>
          <span class="muted" style="font-size:13px">${esc(b.author)}</span>
          <span class="muted" style="font-size:12px">${esc(b.id)} · Shelf ${esc(b.shelf)} · ${b.year}</span>
          ${OS.AUDIOBOOKS[b.id] ? `<a href="audiobooks.html#${esc(b.id)}" style="font-size:13px;font-weight:500;display:inline-flex;gap:6px;align-items:center;text-decoration:none">${OS.icon('headphones', 16)}Listen · ${OS.audioLength(b.id)} min summary</a>` : ''}
          <div class="foot">
            <span class="badge ${b.available > 0 ? 'green' : 'red'}">${b.available > 0 ? `${b.available} of ${b.total} available` : 'All issued'}${b.queue ? ` · ${b.queue} waiting` : ''}</span>
            ${actionFor(b)}
          </div>
        </div>
      </article>`).join('') : '<div class="empty" style="grid-column:1/-1">No books match your search. Try a different title or category.</div>';

    OS.$$('[data-res]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        const r = await OS.api.reserve(me.id, btn.dataset.res);
        OS.toast(r.status === 'ready' ? `Reserved! Collect it from the desk by ${OS.fmtDate(r.holdUntil)}.` : `Added to queue — you're #${r.position}. We'll notify you.`, 'success');
        await loadMine(); render();
      } catch (e) { OS.toast(e.message, 'error'); }
    }));
    OS.$$('[data-edit]').forEach((btn) => btn.addEventListener('click', async () => bookForm(await OS.api.getBook(btn.dataset.edit))));
    OS.$$('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
      const b = await OS.api.getBook(btn.dataset.del);
      if (!(await OS.confirm('Delete this book?', `"${b.title}" will be removed from the catalog.`, 'Delete', true))) return;
      try { await OS.api.deleteBook(b.id); OS.toast('Book deleted.', 'success'); renderCats(); render(); } catch (e) { OS.toast(e.message, 'error'); }
    }));
  }

  async function bookForm(book) {
    const cats = await OS.api.categories();
    const v = book || { title: '', author: '', isbn: '', category: 'Computer Science', total: 1, shelf: '', year: new Date().getFullYear() };
    const saved = await OS.modal({
      title: book ? 'Edit book' : 'Add a new book',
      okLabel: book ? 'Save changes' : 'Add book',
      body: `
        <div class="form-grid">
          <div class="field full"><label for="f-title">Title</label><input class="input" id="f-title" name="title" required value="${esc(v.title)}"></div>
          <div class="field full"><label for="f-author">Author(s)</label><input class="input" id="f-author" name="author" required value="${esc(v.author)}"></div>
          <div class="field"><label for="f-isbn">ISBN</label><input class="input" id="f-isbn" name="isbn" value="${esc(v.isbn)}" placeholder="13 digits"></div>
          <div class="field"><label for="f-cat">Category</label><select class="input" id="f-cat" name="category">${cats.map((c) => `<option ${c === v.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-total">Total copies</label><input class="input" id="f-total" name="total" type="number" min="1" value="${v.total}"></div>
          <div class="field"><label for="f-shelf">Shelf</label><input class="input" id="f-shelf" name="shelf" value="${esc(v.shelf === '—' ? '' : v.shelf)}" placeholder="e.g. CS-A1"></div>
          <div class="field"><label for="f-year">Edition year</label><input class="input" id="f-year" name="year" type="number" value="${v.year}"></div>
        </div>`,
      onOk: (form) => {
        const data = Object.fromEntries(new FormData(form));
        if (!data.title.trim() || !data.author.trim()) throw new Error('Title and author are required.');
        if (data.isbn && !/^\d{10}(\d{3})?$/.test(data.isbn.replace(/-/g, ''))) throw new Error('ISBN should be 10 or 13 digits.');
        data.isbn = data.isbn.replace(/-/g, '');
        return book ? OS.api.updateBook(book.id, data) : OS.api.addBook(data);
      }
    });
    if (saved) { OS.toast(book ? 'Book updated.' : `"${saved.title}" added as ${saved.id}.`, 'success'); renderCats(); render(); }
  }

  $('#q').addEventListener('input', OS.debounce(() => { state.q = $('#q').value; render(); }, 150));
  $('#sort').addEventListener('change', () => { state.sort = $('#sort').value; render(); });
  $('#availOnly').addEventListener('change', () => { state.availableOnly = $('#availOnly').checked; render(); });

  (async () => {
    await loadMine();
    await renderCats();
    await render();
    if (isLib && params.get('add')) bookForm();
  })().catch((e) => OS.toast(e.message, 'error'));
})();
