/* OpenShelf — API layer
   ---------------------------------------------------------------
   Every page talks to data ONLY through these functions. Right now they read
   and write the dummy database in store.js. When the real backend is ready,
   replace the body of each function with a fetch() call to the endpoint
   written above it (see API.md). Pages don't need to change, because every
   function already returns a Promise.

   Example of the swap:
     listBooks(params) {
       return http('GET', '/api/books?' + new URLSearchParams(params));
     }
*/
window.OS = window.OS || {};

(function (OS) {
  const R = OS.RULES;

  // ---- small helpers ----
  const ok = (data) => Promise.resolve(JSON.parse(JSON.stringify(data)));
  const fail = (msg) => Promise.reject(new Error(msg));
  const todayISO = () => OS.toISO(OS.today());
  const db = () => OS.db();
  const save = () => OS.saveDB();
  const book = (id) => db().books.find((b) => b.id === id);
  const user = (id) => db().users.find((u) => u.id.toLowerCase() === String(id || '').trim().toLowerCase());
  const publicUser = (u) => u && ({ id: u.id, role: u.role, name: u.name, dept: u.dept, email: u.email });

  // Optional: real backend (fill in BASE_URL and use http() inside the functions)
  OS.CONFIG = { BASE_URL: '' };
  async function http(method, path, body) { // eslint-disable-line no-unused-vars
    const res = await fetch(OS.CONFIG.BASE_URL + path, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  }

  // Live fine for a transaction (books not yet returned keep adding fine).
  function fineOf(tx) {
    if (tx.returnDate) return tx.fine;
    const late = OS.daysBetween(OS.parseISO(tx.dueDate), OS.today());
    return Math.max(0, late) * R.finePerDay;
  }
  function enrichTx(tx) {
    const b = book(tx.bookId), u = user(tx.userId);
    const daysLeft = OS.daysBetween(OS.today(), OS.parseISO(tx.dueDate));
    return {
      ...tx,
      book: b ? { id: b.id, title: b.title, author: b.author, color: b.color, category: b.category, shelf: b.shelf } : { id: tx.bookId, title: '(deleted book)', author: '', color: '#8C7F72' },
      user: publicUser(u) || { id: tx.userId, name: '(unknown)', role: '' },
      fine: fineOf(tx),
      daysLeft,
      overdue: !tx.returnDate && daysLeft < 0
    };
  }

  function notify(userId, text, type = 'info') {
    db().notifications.unshift({ id: OS.nextId('NT-', 'nt', 3), userId, date: todayISO(), type, text, read: false });
  }

  // Give a free copy to the first person waiting in the queue.
  function promoteQueue(bookId) {
    const b = book(bookId);
    if (!b) return;
    while (b.available > 0) {
      const next = db().reservations
        .filter((r) => r.bookId === bookId && r.status === 'waiting')
        .sort((a, c) => a.date.localeCompare(c.date) || a.id.localeCompare(c.id))[0];
      if (!next) return;
      next.status = 'ready';
      next.holdUntil = OS.toISO(OS.addDays(OS.today(), R.holdDays));
      b.available -= 1;
      notify(next.userId, `"${b.title}" is ready for pickup. Collect it by ${OS.fmtDate(next.holdUntil)}.`, 'success');
    }
  }

  // Expire holds that were not collected in time.
  function housekeeping() {
    const t = todayISO();
    let changed = false;
    db().reservations.forEach((r) => {
      if (r.status === 'ready' && r.holdUntil < t) {
        r.status = 'expired';
        const b = book(r.bookId);
        if (b) b.available += 1;
        notify(r.userId, `Your hold on "${b ? b.title : r.bookId}" expired because it wasn't collected.`, 'warn');
        promoteQueue(r.bookId);
        changed = true;
      }
    });
    if (changed) save();
  }

  function queuePosition(r) {
    const waiting = db().reservations
      .filter((x) => x.bookId === r.bookId && x.status === 'waiting')
      .sort((a, c) => a.date.localeCompare(c.date) || a.id.localeCompare(c.id));
    return waiting.findIndex((x) => x.id === r.id) + 1;
  }

  function memberStats(u) {
    const txs = db().transactions.filter((t) => t.userId === u.id);
    const active = txs.filter((t) => !t.returnDate);
    const overdue = active.filter((t) => fineOf(t) > 0);
    const unpaid = txs.filter((t) => t.returnDate && t.fine > 0 && !t.finePaid).reduce((s, t) => s + t.fine, 0);
    const accruing = overdue.reduce((s, t) => s + fineOf(t), 0);
    return {
      issuedCount: active.length, overdueCount: overdue.length,
      unpaidFine: unpaid, accruingFine: accruing, totalDue: unpaid + accruing,
      limit: R[u.role] ? R[u.role].maxBooks : 0, loanDays: R[u.role] ? R[u.role].loanDays : 0,
      totalBorrowed: txs.length
    };
  }

  OS.fmtDate = (iso) => {
    if (!iso) return '—';
    const d = OS.parseISO(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  OS.api = {
    // POST /api/auth/login  { id, password, role }  → user
    login(id, password, role) {
      const u = user(id);
      if (!u || u.password !== password) return fail('Wrong ID or password.');
      if (role && u.role !== role) return fail(`This ID belongs to a ${u.role}. Pick the "${u.role}" role.`);
      return ok(publicUser(u));
    },

    // GET /api/books/categories
    categories() {
      return ok([...new Set(db().books.map((b) => b.category))].sort());
    },

    // GET /api/books?q=&category=&sort=&availableOnly=
    listBooks({ q = '', category = 'All', sort = 'title', availableOnly = false } = {}) {
      housekeeping();
      const s = q.trim().toLowerCase();
      let list = db().books.filter((b) =>
        (category === 'All' || b.category === category) &&
        (!availableOnly || b.available > 0) &&
        (!s || b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s) || b.isbn.includes(s) || b.id.toLowerCase().includes(s)));
      const popularity = {};
      db().transactions.forEach((t) => { popularity[t.bookId] = (popularity[t.bookId] || 0) + 1; });
      const sorters = {
        title: (a, b) => a.title.localeCompare(b.title),
        newest: (a, b) => b.year - a.year,
        popular: (a, b) => (popularity[b.id] || 0) - (popularity[a.id] || 0),
        available: (a, b) => b.available - a.available
      };
      list = list.slice().sort(sorters[sort] || sorters.title);
      return ok(list.map((b) => ({
        ...b,
        timesIssued: popularity[b.id] || 0,
        queue: db().reservations.filter((r) => r.bookId === b.id && r.status === 'waiting').length
      })));
    },

    // GET /api/books/:id
    getBook(id) {
      const b = book(id) || db().books.find((x) => x.isbn === String(id).trim());
      return b ? ok(b) : fail('No book found with that ID or ISBN.');
    },

    // POST /api/books
    addBook(data) {
      if (!data.title || !data.author) return fail('Title and author are required.');
      const copies = Math.max(1, parseInt(data.total, 10) || 1);
      const palette = ['#2F4B6E', '#3E6B5E', '#8A5A2B', '#5B4B7A', '#8C3B36', '#4F6B3A', '#3B6E80', '#A0522D'];
      const b = {
        id: OS.nextId('BK-', 'bk', 3), isbn: (data.isbn || '').trim(), title: data.title.trim(), author: data.author.trim(),
        category: data.category || 'General', total: copies, available: copies, shelf: (data.shelf || '').trim() || '—',
        color: palette[Math.floor(Math.random() * palette.length)], year: parseInt(data.year, 10) || new Date().getFullYear(), addedOn: todayISO()
      };
      db().books.push(b);
      save();
      return ok(b);
    },

    // PUT /api/books/:id
    updateBook(id, data) {
      const b = book(id);
      if (!b) return fail('Book not found.');
      const issued = b.total - b.available;
      const total = Math.max(1, parseInt(data.total, 10) || b.total);
      if (total < issued) return fail(`${issued} copies are issued right now, so total can't be less than ${issued}.`);
      Object.assign(b, {
        title: data.title.trim() || b.title, author: data.author.trim() || b.author, isbn: (data.isbn || '').trim(),
        category: data.category || b.category, shelf: (data.shelf || '').trim() || b.shelf,
        year: parseInt(data.year, 10) || b.year, available: b.available + (total - b.total), total
      });
      promoteQueue(b.id);
      save();
      return ok(b);
    },

    // DELETE /api/books/:id
    deleteBook(id) {
      const b = book(id);
      if (!b) return fail('Book not found.');
      if (b.available < b.total) return fail('Some copies are issued or on hold. Delete it after they come back.');
      db().books = db().books.filter((x) => x.id !== id);
      db().reservations.forEach((r) => { if (r.bookId === id && r.status === 'waiting') r.status = 'cancelled'; });
      save();
      return ok({ deleted: id });
    },

    // GET /api/members  (librarian)
    listMembers({ q = '', role = 'All' } = {}) {
      housekeeping();
      const s = q.trim().toLowerCase();
      return ok(db().users
        .filter((u) => u.role !== 'librarian')
        .filter((u) => role === 'All' || u.role === role)
        .filter((u) => !s || u.name.toLowerCase().includes(s) || u.id.toLowerCase().includes(s) || u.dept.toLowerCase().includes(s))
        .map((u) => ({ ...publicUser(u), ...memberStats(u) })));
    },

    // GET /api/members/:id
    getMember(id) {
      housekeeping();
      const u = user(id);
      if (!u || u.role === 'librarian') return fail('No student or faculty member with that ID.');
      return ok({ ...publicUser(u), ...memberStats(u) });
    },

    // GET /api/members/:id/summary   (everything a student/faculty dashboard needs)
    memberSummary(userId) {
      housekeeping();
      const u = user(userId);
      if (!u) return fail('User not found.');
      const txs = db().transactions.filter((t) => t.userId === u.id).map(enrichTx);
      const reservations = db().reservations
        .filter((r) => r.userId === u.id)
        .map((r) => ({ ...r, book: book(r.bookId) || { title: '(deleted book)', author: '', color: '#8C7F72' }, position: r.status === 'waiting' ? queuePosition(r) : 0 }))
        .sort((a, b) => b.date.localeCompare(a.date));
      return ok({
        user: publicUser(u),
        stats: memberStats(u),
        issued: txs.filter((t) => !t.returnDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        history: txs.filter((t) => t.returnDate).sort((a, b) => b.returnDate.localeCompare(a.returnDate)),
        reservations,
        notifications: db().notifications.filter((n) => n.userId === u.id)
      });
    },

    // POST /api/transactions/issue  { userId, bookId }
    issueBook(userId, bookId) {
      housekeeping();
      const u = user(userId), b = book(bookId) || db().books.find((x) => x.isbn === String(bookId).trim());
      if (!u || u.role === 'librarian') return fail('Enter a valid student or faculty ID.');
      if (!b) return fail('Enter a valid book ID or ISBN.');
      const st = memberStats(u);
      if (st.issuedCount >= st.limit) return fail(`${u.name} already has ${st.issuedCount} books — the ${u.role} limit is ${st.limit}.`);
      if (st.overdueCount > 0) return fail(`${u.name} has ${st.overdueCount} overdue book(s). Return them first.`);
      if (st.unpaidFine > 0) return fail(`${u.name} has an unpaid fine of ₹${st.unpaidFine}. Collect it first.`);
      if (db().transactions.some((t) => t.userId === u.id && t.bookId === b.id && !t.returnDate)) return fail(`${u.name} already has a copy of this book.`);

      const hold = db().reservations.find((r) => r.userId === u.id && r.bookId === b.id && r.status === 'ready');
      if (hold) {
        hold.status = 'fulfilled'; // copy was already set aside for them
      } else {
        if (b.available <= 0) {
          const ready = db().reservations.some((r) => r.bookId === b.id && r.status === 'ready');
          return fail(ready ? 'The free copy is on hold for another member who reserved it.' : 'No copies available. The member can reserve it instead.');
        }
        b.available -= 1;
        const waiting = db().reservations.find((r) => r.userId === u.id && r.bookId === b.id && r.status === 'waiting');
        if (waiting) waiting.status = 'fulfilled';
      }
      const tx = {
        id: OS.nextId('TX-', 'tx', 4), bookId: b.id, userId: u.id, issueDate: todayISO(),
        dueDate: OS.toISO(OS.addDays(OS.today(), R[u.role].loanDays)), returnDate: null, renewals: 0, fine: 0, finePaid: true
      };
      db().transactions.push(tx);
      notify(u.id, `"${b.title}" was issued to you. Due on ${OS.fmtDate(tx.dueDate)}.`, 'info');
      save();
      return ok(enrichTx(tx));
    },

    // POST /api/transactions/:id/return  { finePaid }
    returnBook(txId, { finePaid = false } = {}) {
      const tx = db().transactions.find((t) => t.id === txId);
      if (!tx) return fail('Transaction not found.');
      if (tx.returnDate) return fail('This book is already returned.');
      tx.fine = fineOf(tx);
      tx.returnDate = todayISO();
      tx.finePaid = tx.fine === 0 || !!finePaid;
      const b = book(tx.bookId);
      if (b) { b.available += 1; promoteQueue(b.id); }
      if (tx.fine > 0 && !tx.finePaid) notify(tx.userId, `Returned "${b ? b.title : ''}" late. Fine of ₹${tx.fine} is pending.`, 'warn');
      save();
      return ok(enrichTx(tx));
    },

    // POST /api/transactions/:id/renew
    renew(txId, userId) {
      housekeeping();
      const tx = db().transactions.find((t) => t.id === txId && t.userId === userId);
      if (!tx || tx.returnDate) return fail('This book is not issued to you.');
      if (fineOf(tx) > 0) return fail('Overdue books can\'t be renewed. Please return it at the desk.');
      if (tx.renewals >= R.maxRenewals) return fail('You have already renewed this book once.');
      if (db().reservations.some((r) => r.bookId === tx.bookId && r.status === 'waiting')) return fail('Someone has reserved this book, so it can\'t be renewed.');
      const u = user(userId);
      tx.dueDate = OS.toISO(OS.addDays(OS.parseISO(tx.dueDate), R[u.role].loanDays));
      tx.renewals += 1;
      save();
      return ok(enrichTx(tx));
    },

    // POST /api/reservations  { userId, bookId }
    reserve(userId, bookId) {
      housekeeping();
      const u = user(userId), b = book(bookId);
      if (!u || u.role === 'librarian') return fail('Only students and faculty can reserve.');
      if (!b) return fail('Book not found.');
      if (db().reservations.some((r) => r.userId === u.id && r.bookId === b.id && (r.status === 'waiting' || r.status === 'ready'))) return fail('You have already reserved this book.');
      if (db().transactions.some((t) => t.userId === u.id && t.bookId === b.id && !t.returnDate)) return fail('You already have this book.');
      const r = { id: OS.nextId('RS-', 'rs', 3), bookId: b.id, userId: u.id, date: todayISO(), status: 'waiting', holdUntil: null };
      db().reservations.push(r);
      promoteQueue(b.id); // if a copy is free, it becomes "ready" right away
      save();
      return ok({ ...r, position: r.status === 'waiting' ? queuePosition(r) : 0 });
    },

    // DELETE /api/reservations/:id
    cancelReservation(id, userId) {
      const r = db().reservations.find((x) => x.id === id && x.userId === userId);
      if (!r || (r.status !== 'waiting' && r.status !== 'ready')) return fail('Reservation not found.');
      const wasReady = r.status === 'ready';
      r.status = 'cancelled';
      if (wasReady) { const b = book(r.bookId); if (b) { b.available += 1; promoteQueue(b.id); } }
      save();
      return ok(r);
    },

    // POST /api/members/:id/pay-fines  (librarian collects cash)
    payFines(userId) {
      const list = db().transactions.filter((t) => t.userId === userId && t.returnDate && t.fine > 0 && !t.finePaid);
      if (!list.length) return fail('No unpaid fines for returned books.');
      list.forEach((t) => { t.finePaid = true; });
      const amount = list.reduce((s, t) => s + t.fine, 0);
      notify(userId, `Fine of ₹${amount} received. Thank you!`, 'success');
      save();
      return ok({ amount });
    },

    // PATCH /api/members/:id/notifications/read
    markNotificationsRead(userId) {
      db().notifications.forEach((n) => { if (n.userId === userId) n.read = true; });
      save();
      return ok(true);
    },

    // GET /api/dashboard  (librarian)
    dashboard() {
      housekeeping();
      const d = db(), t = todayISO();
      const active = d.transactions.filter((x) => !x.returnDate);
      const monthStart = t.slice(0, 8) + '01';
      const weekAgo = OS.toISO(OS.addDays(OS.today(), -7));
      const recent = d.transactions.slice()
        .map((x) => ({ x, when: x.returnDate && x.returnDate >= x.issueDate ? x.returnDate : x.issueDate, type: x.returnDate ? 'Returned' : 'Issued' }))
        .sort((a, b) => b.when.localeCompare(a.when) || b.x.id.localeCompare(a.x.id))
        .slice(0, 6)
        .map(({ x, when, type }) => ({ ...enrichTx(x), when, type }));
      return ok({
        totalBooks: d.books.reduce((s, b) => s + b.total, 0),
        titles: d.books.length,
        addedThisWeek: d.books.filter((b) => b.addedOn >= weekAgo).length,
        issuedToday: d.transactions.filter((x) => x.issueDate === t).length,
        returnedToday: d.transactions.filter((x) => x.returnDate === t).length,
        onLoan: active.length,
        overdue: active.filter((x) => fineOf(x) > 0).map(enrichTx).sort((a, b) => b.fine - a.fine),
        finesThisMonth: d.transactions.filter((x) => x.returnDate && x.returnDate >= monthStart && x.finePaid).reduce((s, x) => s + x.fine, 0),
        members: d.users.filter((u) => u.role !== 'librarian').length,
        waitingReservations: d.reservations.filter((r) => r.status === 'waiting').length,
        readyReservations: d.reservations.filter((r) => r.status === 'ready').map((r) => ({ ...r, book: book(r.bookId), user: publicUser(user(r.userId)) })),
        recent
      });
    },

    // GET /api/members/:id/active-loans  (used on the Return screen)
    activeLoans(userId) {
      const u = user(userId);
      if (!u || u.role === 'librarian') return fail('No student or faculty member with that ID.');
      return ok(db().transactions.filter((t) => t.userId === u.id && !t.returnDate).map(enrichTx));
    },

    // GET /api/reports?period=week|month|semester
    report(period = 'month') {
      housekeeping();
      const d = db(), today = OS.today();
      let from;
      if (period === 'week') from = OS.addDays(today, -6);
      else if (period === 'semester') from = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      else from = new Date(today.getFullYear(), today.getMonth(), 1);
      const f = OS.toISO(from);
      const inRange = (iso) => iso && iso >= f;

      const issued = d.transactions.filter((t) => inRange(t.issueDate));
      const returned = d.transactions.filter((t) => inRange(t.returnDate));

      const months = [];
      for (let i = 5; i >= 0; i--) {
        const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = OS.toISO(m).slice(0, 7);
        months.push({ label: m.toLocaleDateString('en-IN', { month: 'short' }), value: d.transactions.filter((t) => t.issueDate.slice(0, 7) === key).length });
      }

      const catCount = {};
      issued.forEach((t) => { const b = book(t.bookId); const c = b ? b.category : 'Other'; catCount[c] = (catCount[c] || 0) + 1; });
      const totalCat = Object.values(catCount).reduce((a, b) => a + b, 0) || 1;
      const categories = Object.entries(catCount).sort((a, b) => b[1] - a[1])
        .map(([label, n]) => ({ label, count: n, pct: Math.round(n / totalCat * 100) }));

      const bookCount = {};
      issued.forEach((t) => { bookCount[t.bookId] = (bookCount[t.bookId] || 0) + 1; });
      const top = Object.entries(bookCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, count], i) => { const b = book(id) || { title: id, category: '—' }; return { rank: i + 1, id, title: b.title, category: b.category, count }; });

      const members = d.users.filter((u) => u.role !== 'librarian').map((u) => ({ ...publicUser(u), ...memberStats(u) }));
      return ok({
        period, from: f,
        issued: issued.length,
        returned: returned.length,
        overdueNow: d.transactions.filter((t) => !t.returnDate && fineOf(t) > 0).length,
        finesCollected: returned.filter((t) => t.finePaid).reduce((s, t) => s + t.fine, 0),
        finesPending: members.reduce((s, m) => s + m.totalDue, 0),
        membersWithDues: members.filter((m) => m.totalDue > 0).length,
        months, categories, top,
        rows: issued.map(enrichTx)
      });
    }
  };
})(window.OS);
