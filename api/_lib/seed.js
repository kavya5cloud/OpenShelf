// Demo data: the same sample library the frontend used to keep in localStorage
// (ported from the old js/store.js seed). Dates are relative to today, so the
// demo always has a few books due soon, a few overdue, and a reservation queue.
import bcrypt from 'bcryptjs';
import { RULES } from './rules.js';
import { todayISO, addDays, daysBetween, monthOf } from './dates.js';

export async function seed(c) {
  const t = todayISO();
  const iso = (n) => addDays(t, n);

  const users = [
    { id: 'ADM-001', password: 'superadmin123', role: 'admin', name: 'System Administrator', dept: 'IT Administration', email: 'admin@college.edu' },
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
    ({ id, isbn, title, author, category, total, available: total, shelf, color, year, added_on: iso(-200) });
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
  const members = users.filter((u) => u.role === 'student' || u.role === 'faculty');

  const transactions = [];
  let tid = 1;
  const add = (bookId, userId, issueOffset, returnOffset, opts = {}) => {
    const u = users.find((x) => x.id === userId);
    const due = iso(issueOffset + RULES[u.role].loanDays);
    let fine = 0;
    if (returnOffset !== null) fine = Math.max(0, daysBetween(due, iso(returnOffset))) * RULES.finePerDay;
    transactions.push({
      id: 'TX-' + String(tid++).padStart(4, '0'), book_id: bookId, user_id: userId,
      issue_date: iso(issueOffset), due_date: due, return_date: returnOffset === null ? null : iso(returnOffset),
      renewals: 0, fine, fine_paid: opts.finePaid !== undefined ? opts.finePaid : true
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
    const isBreak = monthOf(iso(off)) === 5; // June is a holiday month → fewer issues
    const perDay = isBreak ? (rnd() < 0.3 ? 1 : 0) : Math.floor(rnd() * 3);
    for (let k = 0; k < perDay; k++) {
      const u = members[Math.floor(rnd() * members.length)];
      const late = rnd() < 0.15 ? Math.ceil(rnd() * 6) : -Math.floor(rnd() * 8);
      // never return in the future; recent ones come back a little early
      const ret = Math.min(off + RULES[u.role].loanDays + late, -1 - Math.floor(rnd() * 3));
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
    if (!tx.return_date) books.find((b) => b.id === tx.book_id).available -= 1;
  });

  const reservations = [
    { id: 'RS-001', book_id: 'BK-017', user_id: '24BCS014', date: iso(-4), status: 'waiting', hold_until: null },
    { id: 'RS-002', book_id: 'BK-017', user_id: '24BCS001', date: iso(-3), status: 'waiting', hold_until: null },
    { id: 'RS-003', book_id: 'BK-014', user_id: '24BCS001', date: iso(-1), status: 'waiting', hold_until: null }
  ];
  const notifications = [
    { id: 'NT-001', user_id: '24BCS001', date: iso(-1), type: 'info', text: 'Welcome to OpenShelf! You can reserve books that are currently issued.', read: false }
  ];

  // Hash each distinct password once.
  const hashes = {};
  for (const p of new Set(users.map((u) => u.password))) hashes[p] = await bcrypt.hash(p, 10);
  const userRows = users.map(({ password, ...u }) => ({ ...u, password_hash: hashes[password] }));

  const insert = (table, cols, rows) => c.query(
    `insert into ${table} (${cols}) select ${cols} from json_populate_recordset(null::${table}, $1)`,
    [JSON.stringify(rows)]);

  await c.query('truncate notifications, reservations, transactions, books, users');
  await insert('users', 'id, password_hash, role, name, dept, email', userRows);
  await insert('books', 'id, isbn, title, author, category, total, available, shelf, color, year, added_on', books);
  await insert('transactions', 'id, book_id, user_id, issue_date, due_date, return_date, renewals, fine, fine_paid', transactions);
  await insert('reservations', 'id, book_id, user_id, date, status, hold_until', reservations);
  await insert('notifications', 'id, user_id, date, type, text, read', notifications);
  await c.query(`select setval('bk_seq', $1), setval('tx_seq', $2), setval('rs_seq', $3), setval('nt_seq', $4)`,
    [books.length, transactions.length, reservations.length, notifications.length]);
}
