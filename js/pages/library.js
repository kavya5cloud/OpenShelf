/* My Shelf — a student's/faculty member's books, shown on bookshelves */
(function () {
  const me = OS.requireAuth(['student', 'faculty']);
  if (!me) return;
  OS.shell('shelf');
  const $ = OS.$, esc = OS.esc;
  $('#searchIcon').outerHTML = OS.icon('search', 18);

  let mode = 'shelves', q = '', data = null, allBooks = [];

  const match = (b) => !q || b.title.toLowerCase().includes(q) || String(b.author).toLowerCase().includes(q);

  // One book standing on a shelf
  function shelfBook(b, { href, tip, progress, flag }) {
    return `<a class="shelf-book" href="${href}" aria-label="${esc(b.title)}${tip ? ' — ' + esc(tip) : ''}">
      ${tip ? `<span class="tip">${esc(tip)}</span>` : ''}
      ${flag || ''}
      ${OS.cover(b, 'md')}
      ${progress !== undefined ? `<span class="progress"><span style="width:${progress}%"></span></span>` : ''}
    </a>`;
  }

  function shelf(title, items, more, emptyText) {
    const list = items.filter((x) => match(x.book));
    return `<section class="shelf-section" aria-label="${esc(title)}">
      <div class="shelf-head"><h2>${esc(title)}</h2>${more ? `<a href="${more}">Full shelf ${OS.icon('arrow', 14)}</a>` : ''}</div>
      <div class="shelf">${list.length
        ? `<div class="shelf-books">${list.map((x) => shelfBook(x.book, x)).join('')}</div>`
        : `<div class="shelf-empty">${q ? 'Nothing on this shelf matches your search.' : emptyText}</div>`}</div>
    </section>`;
  }

  async function load() {
    data = await OS.api.memberSummary(me.id);
    const books = OS.db().books;
    const byId = (id) => books.find((b) => b.id === id);

    // Currently reading = issued books; progress = how far into the loan period
    data.reading = data.issued.map((t) => {
      const b = byId(t.bookId) || t.book;
      const total = OS.daysBetween(OS.parseISO(t.issueDate), OS.parseISO(t.dueDate)) || 1;
      const used = OS.daysBetween(OS.parseISO(t.issueDate), OS.today());
      return {
        book: b, href: 'my-books.html', tip: OS.dueText(t),
        progress: Math.min(100, Math.max(4, Math.round(used / total * 100))),
        flag: t.overdue ? '<span class="badge red flag">Late</span>' : t.daysLeft <= 2 ? '<span class="badge amber flag">Due soon</span>' : ''
      };
    });

    data.next = data.reservations.filter((r) => r.status === 'ready' || r.status === 'waiting').map((r) => ({
      book: byId(r.bookId) || r.book, href: 'reservations.html',
      tip: r.status === 'ready' ? 'Ready — collect by ' + OS.fmtDate(r.holdUntil) : '#' + r.position + ' in queue',
      flag: r.status === 'ready' ? '<span class="badge green flag">Ready</span>' : ''
    }));

    const prog = OS.audioProgress.get().books;
    data.listen = Object.keys(OS.AUDIOBOOKS)
      .map((id) => byId(id)).filter(Boolean)
      .sort((a, b) => ((prog[b.id] && prog[b.id].at) || 0) - ((prog[a.id] && prog[a.id].at) || 0))
      .map((b) => ({ book: b, href: 'audiobooks.html#' + b.id, tip: `${OS.audioLength(b.id)} min · ${OS.audioProgress.percent(b.id) ? OS.audioProgress.percent(b.id) + '% listened' : 'Not started'}`, progress: OS.audioProgress.percent(b.id) || undefined }));

    const seen = new Set();
    data.finished = data.history.filter((t) => !seen.has(t.bookId) && seen.add(t.bookId)).map((t) => ({
      book: byId(t.bookId) || t.book, href: 'my-books.html', tip: 'Returned ' + OS.fmtDate(t.returnDate)
    }));

    // Simple recommendations: available books from categories you've read, that you haven't borrowed
    const mine = new Set([...data.issued, ...data.history].map((t) => t.bookId));
    const cats = {};
    [...data.issued, ...data.history].forEach((t) => { const b = byId(t.bookId); if (b) cats[b.category] = (cats[b.category] || 0) + 1; });
    data.recommended = books
      .filter((b) => !mine.has(b.id) && b.available > 0)
      .sort((a, b) => (cats[b.category] || 0) - (cats[a.category] || 0))
      .slice(0, 8)
      .map((b) => ({ book: b, href: 'catalog.html?q=' + encodeURIComponent(b.title), tip: `${b.category} · ${b.available} available` }));

    const all = new Map();
    [...data.reading, ...data.next, ...data.finished].forEach((x) => { if (!all.has(x.book.id)) all.set(x.book.id, x); });
    allBooks = [...all.values()];
  }

  function render() {
    const v = $('#view');
    if (mode === 'all') {
      const list = allBooks.filter((x) => match(x.book));
      v.innerHTML = `<section class="shelf-section"><div class="shelf-head"><h2>All my books · ${list.length}</h2></div>
        ${list.length ? `<div class="audio-grid">${list.map((x) => `
          <a class="audio-card" href="${x.href}" style="text-decoration:none">${OS.cover(x.book, 'lg')}<b>${esc(x.book.title)}</b><small>${esc(x.tip)}</small></a>`).join('')}</div>`
          : '<div class="empty">No books match.</div>'}</section>`;
      return;
    }
    v.innerHTML = [
      shelf('Currently reading', data.reading, 'my-books.html', 'No books issued right now — pick one from the catalog.'),
      shelf('Up next', data.next, 'reservations.html', 'Reserve a book and it will wait here.'),
      shelf('Listen', data.listen, 'audiobooks.html', ''),
      shelf('Finished', data.finished, 'my-books.html', 'Books you return will be shelved here.'),
      shelf('Recommended for you', data.recommended, 'catalog.html', 'Borrow a few books and we will suggest more like them.')
    ].join('');
  }

  function setMode(m) {
    mode = m;
    $('#tabShelves').setAttribute('aria-selected', String(m === 'shelves'));
    $('#tabAll').setAttribute('aria-selected', String(m === 'all'));
    render();
  }
  $('#tabShelves').addEventListener('click', () => setMode('shelves'));
  $('#tabAll').addEventListener('click', () => setMode('all'));
  $('#q').addEventListener('input', OS.debounce(() => { q = $('#q').value.trim().toLowerCase(); render(); }, 120));

  load().then(render).catch((e) => OS.toast(e.message, 'error'));
})();
