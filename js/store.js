/* OpenShelf — dummy database
   ---------------------------------------------------------------
   This file plays the role of the database until the real backend is ready.
   Data is saved in the browser's localStorage, so changes survive a refresh.
   "Reset demo data" (in the sidebar) restores the seed below.

   Tables (same names the backend should use):
     users, books, transactions, reservations, notifications
*/
window.OS = window.OS || {};

(function (OS) {
  const KEY = 'openshelf_db_v2';
  const DAY = 24 * 60 * 60 * 1000;

  // Library rules — change here and the whole app follows.
  OS.RULES = {
    student: { maxBooks: 4, loanDays: 14 },
    faculty: { maxBooks: 10, loanDays: 30 },
    finePerDay: 5,        // ₹ per late day
    holdDays: 2,          // days a "ready" reservation is kept for pickup
    maxRenewals: 1
  };

  // ---------- date helpers ----------
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  OS.today = () => startOfDay(new Date());
  OS.addDays = (d, n) => new Date(startOfDay(d).getTime() + n * DAY);
  OS.toISO = (d) => {
    const x = startOfDay(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  };
  OS.parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  OS.daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

  // ---------- seed data ----------
  function seed() {
    const t = OS.today();
    const iso = (n) => OS.toISO(OS.addDays(t, n));

    const users = [
      { id: 'LIB-001', password: 'admin123', role: 'librarian', name: 'Library Admin', dept: 'Central Library', email: 'library@college.edu' },
      { id: '24BCS001', password: 'student123', role: 'student', name: 'Riya Shah', dept: 'CSBS', email: 'riya.s@college.edu' },
      { id: '24BCS014', password: 'student123', role: 'student', name: 'Karan Patel', dept: 'CSBS', email: 'karan.p@college.edu' },
      { id: '24BCE027', password: 'student123', role: 'student', name: 'Neha Joshi', dept: 'Computer Eng.', email: 'neha.j@college.edu' },
      { id: '23BME009', password: 'student123', role: 'student', name: 'Dev Trivedi', dept: 'Mechanical', email: 'dev.t@college.edu' },
      { id: '24BIT033', password: 'student123', role: 'student', name: 'Meera Iyer', dept: 'IT', email: 'meera.i@college.edu' },
      { id: '25BCS041', password: 'student123', role: 'student', name: 'Aarav Desai', dept: 'CSBS', email: 'aarav.d@college.edu' },
      { id: 'FAC-1024', password: 'faculty123', role: 'faculty', name: 'Dr. Anil Mehta', dept: 'Computer Science', email: 'a.mehta@college.edu' },
      { id: 'FAC-2051', password: 'faculty123', role: 'faculty', name: 'Prof. Sunita Rao', dept: 'Management', email: 's.rao@college.edu' }
    ];

    const B = (id, isbn, title, author, category, total, shelf, color, year) =>
      ({ id, isbn, title, author, category, total, available: total, shelf, color, year, addedOn: iso(-200) });
    const books = [
      B('BK-001', '9780262046305', 'Introduction to Algorithms', 'Cormen, Leiserson, Rivest, Stein', 'Computer Science', 4, 'CS-A1', '#2F4B6E', 2022),
      B('BK-002', '9780078022159', 'Database System Concepts', 'Silberschatz, Korth, Sudarshan', 'Computer Science', 2, 'CS-A2', '#8A5A2B', 2019),
      B('BK-003', '9781119800361', 'Operating System Concepts', 'Silberschatz, Galvin, Gagne', 'Computer Science', 3, 'CS-A3', '#3E6B5E', 2021),
      B('BK-004', '9780132126953', 'Computer Networks', 'Andrew S. Tanenbaum', 'Computer Science', 2, 'CS-B1', '#5B4B7A', 2010),
      B('BK-005', '9781449373320', 'Designing Data-Intensive Applications', 'Martin Kleppmann', 'Computer Science', 2, 'CS-B2', '#3B6E80', 2017),
      B('BK-006', '9780134685991', 'Effective Java', 'Joshua Bloch', 'Computer Science', 2, 'CS-B3', '#8C3B36', 2018),
      B('BK-007', '9780133594140', 'Software Engineering', 'Ian Sommerville', 'Engineering', 3, 'EN-A1', '#4F6B3A', 2015),
      B('BK-008', '9780132350884', 'Clean Code', 'Robert C. Martin', 'Engineering', 2, 'EN-A2', '#6A4C7D', 2008),
      B('BK-009', '9780135957059', 'The Pragmatic Programmer', 'David Thomas, Andrew Hunt', 'Engineering', 2, 'EN-A3', '#A0522D', 2019),
      B('BK-010', '9780073383095', 'Discrete Mathematics and Its Applications', 'Kenneth H. Rosen', 'Mathematics', 5, 'MA-A1', '#35557F', 2018),
      B('BK-011', '9783031410253', 'Linear Algebra Done Right', 'Sheldon Axler', 'Mathematics', 2, 'MA-A2', '#9C7A3C', 2024),
      B('BK-012', '9780470458365', 'Advanced Engineering Mathematics', 'Erwin Kreyszig', 'Mathematics', 3, 'MA-A3', '#4A4F5A', 2011),
      B('BK-013', '9780135766699', 'Principles of Marketing', 'Philip Kotler, Gary Armstrong', 'Business', 3, 'BU-A1', '#A33F33', 2020),
      B('BK-014', '9780135969854', 'Business Statistics', 'David M. Levine et al.', 'Business', 2, 'BU-A2', '#5E5A52', 2020),
      B('BK-015', '9780199601653', 'Management', 'Stephen P. Robbins', 'Business', 2, 'BU-A3', '#7D3C5A', 2017),
      B('BK-016', '9788173711466', 'Wings of Fire', 'A. P. J. Abdul Kalam', 'General', 4, 'GE-A1', '#B5652B', 1999),
      B('BK-017', '9780735211292', 'Atomic Habits', 'James Clear', 'General', 1, 'GE-A2', '#2E6F73', 2018),
      B('BK-018', '9780143130727', 'The Psychology of Money', 'Morgan Housel', 'General', 2, 'GE-A3', '#4C6E4A', 2020)
    ];

    // Small deterministic random so the demo history is the same every reset.
    let s = 42;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const members = users.filter((u) => u.role !== 'librarian');

    const transactions = [];
    let tid = 1;
    const add = (bookId, userId, issueOffset, returnOffset, opts = {}) => {
      const u = users.find((x) => x.id === userId);
      const days = OS.RULES[u.role].loanDays;
      const issue = iso(issueOffset);
      const due = iso(issueOffset + days);
      let fine = 0;
      if (returnOffset !== null) {
        const late = OS.daysBetween(OS.parseISO(due), OS.parseISO(iso(returnOffset)));
        fine = Math.max(0, late) * OS.RULES.finePerDay;
      }
      transactions.push({
        id: 'TX-' + String(tid++).padStart(4, '0'), bookId, userId,
        issueDate: issue, dueDate: due, returnDate: returnOffset === null ? null : iso(returnOffset),
        renewals: 0, fine, finePaid: opts.finePaid !== undefined ? opts.finePaid : true
      });
    };

    // ~6 months of returned history (drives the Reports page)
    const weights = [0, 0, 0, 0, 1, 2, 9, 7, 3, 9, 6, 12, 15, 4, 1, 0, 7, 5];
    const pickBook = () => {
      const total = weights.reduce((a, b) => a + b + 1, 0);
      let r = rnd() * total;
      for (let i = 0; i < books.length; i++) { r -= weights[i] + 1; if (r <= 0) return books[i].id; }
      return books[0].id;
    };
    for (let off = -180; off < -16; off += 1) {
      const month = OS.addDays(t, off).getMonth();
      const isBreak = month === 5; // June is a holiday month → fewer issues
      const perDay = isBreak ? (rnd() < 0.3 ? 1 : 0) : Math.floor(rnd() * 3);
      for (let k = 0; k < perDay; k++) {
        const u = members[Math.floor(rnd() * members.length)];
        const late = rnd() < 0.15 ? Math.ceil(rnd() * 6) : -Math.floor(rnd() * 8);
        // never return in the future; recent ones come back a little early
        const ret = Math.min(off + OS.RULES[u.role].loanDays + late, -1 - Math.floor(rnd() * 3));
        add(pickBook(), u.id, off, Math.max(ret, off + 1));
      }
    }

    // Currently issued books (these change availability)
    add('BK-001', '24BCS001', -10, null);          // Riya — due in 4 days
    add('BK-002', '24BCS001', -3, null);           // Riya
    add('BK-008', '23BME009', -26, null);          // Dev — 12 days late
    add('BK-007', '24BIT033', -21, null);          // Meera — 7 days late
    add('BK-010', '24BCE027', -18, null);          // Neha — 4 days late
    add('BK-002', '24BCS014', -6, null);           // Karan → Database book now 0 left
    add('BK-017', '24BCE027', -5, null);           // Atomic Habits (only copy)
    add('BK-014', 'FAC-2051', -32, null);          // Prof. Rao — 2 days late
    add('BK-014', '25BCS041', -2, null);           // Business Statistics now 0 left
    add('BK-005', 'FAC-1024', -12, null);
    add('BK-003', '24BCS014', -1, null);
    // A returned-late book with an unpaid fine
    add('BK-004', '25BCS041', -40, -22, { finePaid: false });

    transactions.forEach((tx) => {
      if (!tx.returnDate) books.find((b) => b.id === tx.bookId).available -= 1;
    });

    const reservations = [
      { id: 'RS-001', bookId: 'BK-017', userId: '24BCS014', date: iso(-4), status: 'waiting', holdUntil: null },
      { id: 'RS-002', bookId: 'BK-017', userId: '24BCS001', date: iso(-3), status: 'waiting', holdUntil: null },
      { id: 'RS-003', bookId: 'BK-014', userId: '24BCS001', date: iso(-1), status: 'waiting', holdUntil: null }
    ];

    const notifications = [
      { id: 'NT-001', userId: '24BCS001', date: iso(-1), type: 'info', text: 'Welcome to OpenShelf! You can reserve books that are currently issued.', read: false }
    ];

    return { version: 1, users, books, transactions, reservations, notifications, counters: { tx: tid, rs: 4, nt: 2, bk: 19 } };
  }

  // ---------- persistence ----------
  let memory = null; // fallback if localStorage is blocked

  OS.db = function () {
    if (memory) return memory;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { memory = JSON.parse(raw); return memory; }
    } catch (e) { /* ignore */ }
    memory = seed();
    OS.saveDB();
    return memory;
  };

  OS.saveDB = function () {
    try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* storage full or blocked */ }
  };

  OS.resetDB = function () {
    memory = seed();
    OS.saveDB();
  };

  OS.nextId = function (prefix, counter, pad) {
    const db = OS.db();
    const n = db.counters[counter]++;
    return prefix + String(n).padStart(pad, '0');
  };
})(window.OS);
