// OpenShelf business logic. Each exported function is one endpoint from API.md
// and mirrors what the old browser-only js/api.js did, but against Postgres.
// Anything that changes copies or the reservation queue runs in one database
// transaction with the book row locked, so two desks can't hand out one copy.
import bcrypt from 'bcryptjs';
import { getPool, transaction, fail } from './db.js';
import { RULES } from './rules.js';
import { todayISO, addDays, daysBetween, fmtDate, money } from './dates.js';
import { signToken } from './auth.js';
import { seed } from './seed.js';

// ---------- column lists (snake_case in SQL → camelCase in JSON) ----------
const BOOK = `b.id, b.isbn, b.title, b.author, b.category, b.total, b.available, b.shelf, b.color, b.year, b.added_on as "addedOn"`;
const TX = `t.id, t.book_id as "bookId", t.user_id as "userId", t.issue_date as "issueDate", t.due_date as "dueDate",
  t.return_date as "returnDate", t.renewals, t.fine, t.fine_paid as "finePaid"`;
const RES = `r.id, r.book_id as "bookId", r.user_id as "userId", r.date, r.status, r.hold_until as "holdUntil"`;
const USER = `u.id, u.role, u.name, u.dept, u.email`;
const DELETED_BOOK = { title: '(deleted book)', author: '', color: '#8C7F72' };

const isMember = (u) => !!u && (u.role === 'student' || u.role === 'faculty');
const MEMBER_ROLES = `('student', 'faculty')`;

const one = async (c, sql, params) => (await c.query(sql, params)).rows[0];
const all = async (c, sql, params) => (await c.query(sql, params)).rows;

async function nextId(c, seq, prefix, pad) {
  return (await one(c, `select $1 || lpad(nextval($2)::text, $3, '0') as id`, [prefix, seq, pad])).id;
}

// Live fine: books not yet returned keep adding fine until they come back.
function fineOf(tx) {
  if (tx.returnDate) return tx.fine;
  return Math.max(0, daysBetween(tx.dueDate, todayISO())) * RULES.finePerDay;
}

// A transaction with its book, its member, the live fine and days left.
async function loans(c, where, params = [], order = 't.id') {
  const rows = await all(c, `select ${TX},
      b.id as b_id, b.title as b_title, b.author as b_author, b.color as b_color, b.category as b_category, b.shelf as b_shelf,
      u.id as u_id, u.role as u_role, u.name as u_name, u.dept as u_dept, u.email as u_email
    from transactions t left join books b on b.id = t.book_id left join users u on u.id = t.user_id
    where ${where} order by ${order}`, params);
  return rows.map((r) => {
    const tx = { id: r.id, bookId: r.bookId, userId: r.userId, issueDate: r.issueDate, dueDate: r.dueDate, returnDate: r.returnDate, renewals: r.renewals, fine: r.fine, finePaid: r.finePaid };
    const daysLeft = daysBetween(todayISO(), tx.dueDate);
    return {
      ...tx,
      book: r.b_id ? { id: r.b_id, title: r.b_title, author: r.b_author, color: r.b_color, category: r.b_category, shelf: r.b_shelf } : { id: tx.bookId, ...DELETED_BOOK },
      user: r.u_id ? { id: r.u_id, role: r.u_role, name: r.u_name, dept: r.u_dept, email: r.u_email } : { id: tx.userId, name: '(unknown)', role: '' },
      fine: fineOf(tx),
      daysLeft,
      overdue: !tx.returnDate && daysLeft < 0
    };
  });
}
const loan = async (c, id) => (await loans(c, 't.id = $1', [id]))[0];

async function notify(c, userId, text, type = 'info') {
  const id = await nextId(c, 'nt_seq', 'NT-', 3);
  await c.query('insert into notifications (id, user_id, date, type, text) values ($1, $2, $3, $4, $5)', [id, userId, todayISO(), type, text]);
}

const findUser = (c, id) => one(c, `select ${USER} from users u where lower(u.id) = lower($1)`, [String(id || '').trim()]);
const lockBook = (c, id) => one(c, `select ${BOOK} from books b where b.id = $1 for update`, [id]);
const findBook = (c, idOrIsbn) => one(c, `select ${BOOK} from books b where b.id = $1 or (b.isbn <> '' and b.isbn = $1) order by b.id = $1 desc limit 1`, [String(idOrIsbn || '').trim()]);

// Give free copies to the people waiting in the queue, oldest first.
async function promoteQueue(c, bookId) {
  const b = await lockBook(c, bookId);
  if (!b) return;
  let available = b.available;
  while (available > 0) {
    const next = await one(c, `select id, user_id from reservations where book_id = $1 and status = 'waiting'
      order by date, created_at, id limit 1 for update`, [bookId]);
    if (!next) break;
    const holdUntil = addDays(todayISO(), RULES.holdDays);
    await c.query(`update reservations set status = 'ready', hold_until = $2 where id = $1`, [next.id, holdUntil]);
    available -= 1;
    await notify(c, next.user_id, `"${b.title}" is ready for pickup. Collect it by ${fmtDate(holdUntil)}.`, 'success');
  }
  if (available !== b.available) await c.query('update books set available = $2 where id = $1', [bookId, available]);
}

// Expire holds that were not collected in time and pass the copy on.
async function housekeeping(c) {
  const expired = await all(c, `select r.id, r.user_id, r.book_id, b.title from reservations r left join books b on b.id = r.book_id
    where r.status = 'ready' and r.hold_until < $1 for update of r skip locked`, [todayISO()]);
  for (const r of expired) {
    await c.query(`update reservations set status = 'expired' where id = $1`, [r.id]);
    if (r.title) await c.query('update books set available = available + 1 where id = $1', [r.book_id]);
    await notify(c, r.user_id, `Your hold on "${r.title || r.book_id}" expired because it wasn't collected.`, 'warn');
    await promoteQueue(c, r.book_id);
  }
}

// Borrowing stats for members, keyed by user id.
async function statsFor(c, users) {
  const rows = await all(c, `select user_id,
      count(*) filter (where return_date is null)::int as issued,
      count(*) filter (where return_date is null and due_date < $2)::int as overdue,
      coalesce(sum(fine) filter (where return_date is not null and fine > 0 and not fine_paid), 0)::int as unpaid,
      coalesce(sum(($2::date - due_date) * $3) filter (where return_date is null and due_date < $2), 0)::int as accruing,
      count(*)::int as total
    from transactions where user_id = any($1) group by user_id`, [users.map((u) => u.id), todayISO(), RULES.finePerDay]);
  const by = Object.fromEntries(rows.map((r) => [r.user_id, r]));
  return Object.fromEntries(users.map((u) => {
    const r = by[u.id] || { issued: 0, overdue: 0, unpaid: 0, accruing: 0, total: 0 };
    return [u.id, {
      issuedCount: r.issued, overdueCount: r.overdue,
      unpaidFine: r.unpaid, accruingFine: r.accruing, totalDue: r.unpaid + r.accruing,
      limit: RULES[u.role] ? RULES[u.role].maxBooks : 0, loanDays: RULES[u.role] ? RULES[u.role].loanDays : 0,
      totalBorrowed: r.total
    }];
  }));
}
const memberStats = async (c, u) => (await statsFor(c, [u]))[u.id];

// ==================== auth ====================

// POST /api/auth/login  { id, password, role }  → user + token
export async function login({ id, password, role } = {}) {
  const u = await one(getPool(), `select ${USER}, u.password_hash from users u where lower(u.id) = lower($1)`, [String(id || '').trim()]);
  if (!u || !(await bcrypt.compare(String(password || ''), u.password_hash))) fail('Wrong ID or password.');
  if (u.role === 'admin' && role !== 'admin') fail('Administrators sign in from the Admin login page.');
  if (role === 'admin' && u.role !== 'admin') fail('This account is not an administrator. Use the regular sign-in page.');
  if (role && u.role !== role) fail(`This ID belongs to a ${u.role}. Pick the "${u.role}" role.`);
  const { password_hash, ...user } = u;
  return { ...user, token: signToken({ sub: user.id, role: user.role }) };
}

// ==================== books ====================

// GET /api/books/categories
export async function categories() {
  return (await all(getPool(), 'select distinct category from books order by category')).map((r) => r.category);
}

// GET /api/books?q=&category=&sort=&availableOnly=
export function listBooks({ q = '', category = 'All', sort = 'title', availableOnly = false } = {}) {
  const order = {
    title: 'b.title, b.id',
    newest: 'b.year desc nulls last, b.id',
    popular: '"timesIssued" desc, b.id',
    available: 'b.available desc, b.id'
  }[sort] || 'b.title, b.id';
  return transaction(async (c) => {
    await housekeeping(c);
    return all(c, `select ${BOOK}, coalesce(p.n, 0)::int as "timesIssued", coalesce(w.n, 0)::int as queue
      from books b
      left join (select book_id, count(*) n from transactions group by book_id) p on p.book_id = b.id
      left join (select book_id, count(*) n from reservations where status = 'waiting' group by book_id) w on w.book_id = b.id
      where ($1 = 'All' or b.category = $1)
        and (not $2 or b.available > 0)
        and ($3 = '' or strpos(lower(b.title), $3) > 0 or strpos(lower(b.author), $3) > 0 or strpos(b.isbn, $3) > 0 or strpos(lower(b.id), $3) > 0)
      order by ${order}`,
    [category || 'All', availableOnly === true || availableOnly === 'true', String(q).trim().toLowerCase()]);
  });
}

// GET /api/books/:id   (id or ISBN)
export async function getBook(id) {
  const b = await findBook(getPool(), id);
  return b || fail('No book found with that ID or ISBN.', 404);
}

// POST /api/books
export function addBook(data = {}) {
  const title = String(data.title || '').trim(), author = String(data.author || '').trim();
  if (!title || !author) fail('Title and author are required.');
  const copies = Math.max(1, parseInt(data.total, 10) || 1);
  const palette = ['#2F4B6E', '#3E6B5E', '#8A5A2B', '#5B4B7A', '#8C3B36', '#4F6B3A', '#3B6E80', '#A0522D'];
  return transaction(async (c) => {
    const id = await nextId(c, 'bk_seq', 'BK-', 3);
    await c.query(`insert into books (id, isbn, title, author, category, total, available, shelf, color, year, added_on)
      values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10)`,
    [id, String(data.isbn || '').trim(), title, author, String(data.category || '').trim() || 'General', copies,
      String(data.shelf || '').trim() || '—', palette[Math.floor(Math.random() * palette.length)],
      parseInt(data.year, 10) || new Date().getFullYear(), todayISO()]);
    return findBook(c, id);
  });
}

// PUT /api/books/:id
export function updateBook(id, data = {}) {
  return transaction(async (c) => {
    const b = await lockBook(c, id);
    if (!b) fail('Book not found.', 404);
    const issued = b.total - b.available;
    const total = Math.max(1, parseInt(data.total, 10) || b.total);
    if (total < issued) fail(`${issued} copies are issued right now, so total can't be less than ${issued}.`);
    await c.query(`update books set title = $2, author = $3, isbn = $4, category = $5, shelf = $6, year = $7, available = $8, total = $9 where id = $1`, [
      b.id, String(data.title || '').trim() || b.title, String(data.author || '').trim() || b.author, String(data.isbn || '').trim(),
      String(data.category || '').trim() || b.category, String(data.shelf || '').trim() || b.shelf,
      parseInt(data.year, 10) || b.year, b.available + (total - b.total), total]);
    await promoteQueue(c, b.id);
    return findBook(c, b.id);
  });
}

// DELETE /api/books/:id
export function deleteBook(id) {
  return transaction(async (c) => {
    const b = await lockBook(c, id);
    if (!b) fail('Book not found.', 404);
    if (b.available < b.total) fail('Some copies are issued or on hold. Delete it after they come back.');
    await c.query('delete from books where id = $1', [b.id]);
    await c.query(`update reservations set status = 'cancelled' where book_id = $1 and status = 'waiting'`, [b.id]);
    return { deleted: b.id };
  });
}

// ==================== members ====================

// GET /api/members?q=&role=   (librarian)
export function listMembers({ q = '', role = 'All' } = {}) {
  return transaction(async (c) => {
    await housekeeping(c);
    const s = String(q).trim().toLowerCase();
    const users = await all(c, `select ${USER} from users u
      where u.role in ${MEMBER_ROLES} and ($1 = 'All' or u.role = $1)
        and ($2 = '' or strpos(lower(u.name), $2) > 0 or strpos(lower(u.id), $2) > 0 or strpos(lower(u.dept), $2) > 0)
      order by u.role = 'faculty', u.id`, [role || 'All', s]);
    const stats = await statsFor(c, users);
    return users.map((u) => ({ ...u, ...stats[u.id] }));
  });
}

// GET /api/members/:id
export function getMember(id) {
  return transaction(async (c) => {
    await housekeeping(c);
    const u = await findUser(c, id);
    if (!isMember(u)) fail('No student or faculty member with that ID.', 404);
    return { ...u, ...(await memberStats(c, u)) };
  });
}

// GET /api/members/:id/summary   (everything a student/faculty dashboard needs)
export function memberSummary(id) {
  return transaction(async (c) => {
    await housekeeping(c);
    const u = await findUser(c, id);
    if (!u) fail('User not found.', 404);
    const txs = await loans(c, 't.user_id = $1', [u.id]);
    const reservations = (await all(c, `select ${RES}, to_jsonb(bk) - 'added_on' || jsonb_build_object('addedOn', bk.added_on) as book,
        case when r.status = 'waiting' then (select count(*) from reservations x where x.book_id = r.book_id and x.status = 'waiting'
          and (x.date, x.created_at, x.id) <= (r.date, r.created_at, r.id))::int else 0 end as position
      from reservations r left join books bk on bk.id = r.book_id
      where r.user_id = $1 order by r.date desc, r.created_at desc`, [u.id]))
      .map((r) => ({ ...r, book: r.book || DELETED_BOOK }));
    const notifications = await all(c, `select id, user_id as "userId", date, type, text, read from notifications
      where user_id = $1 order by created_at desc, id desc`, [u.id]);
    return {
      user: u,
      stats: await memberStats(c, u),
      issued: txs.filter((t) => !t.returnDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      history: txs.filter((t) => t.returnDate).sort((a, b) => b.returnDate.localeCompare(a.returnDate)),
      reservations,
      notifications
    };
  });
}

// GET /api/members/:id/active-loans   (Return screen)
export function activeLoans(id) {
  return transaction(async (c) => {
    const u = await findUser(c, id);
    if (!isMember(u)) fail('No student or faculty member with that ID.', 404);
    return loans(c, 't.user_id = $1 and t.return_date is null', [u.id]);
  });
}

// POST /api/members/:id/pay-fines   (librarian collects cash)
export function payFines(id) {
  return transaction(async (c) => {
    const u = await findUser(c, id);
    if (!u) fail('User not found.', 404);
    const paid = await all(c, `update transactions set fine_paid = true
      where user_id = $1 and return_date is not null and fine > 0 and not fine_paid returning fine`, [u.id]);
    if (!paid.length) fail('No unpaid fines for returned books.');
    const amount = paid.reduce((s, t) => s + t.fine, 0);
    await notify(c, u.id, `Fine of ₹${amount} received. Thank you!`, 'success');
    return { amount };
  });
}

// PATCH /api/members/:id/notifications/read
export async function markNotificationsRead(id) {
  await getPool().query('update notifications set read = true where lower(user_id) = lower($1)', [String(id)]);
  return true;
}

// ==================== loans ====================

// POST /api/transactions/issue  { userId, bookId }
export function issueBook({ userId, bookId } = {}) {
  return transaction(async (c) => {
    await housekeeping(c);
    const u = await findUser(c, userId);
    if (!isMember(u)) fail('Enter a valid student or faculty ID.');
    const found = await findBook(c, bookId);
    if (!found) fail('Enter a valid book ID or ISBN.');
    const b = await lockBook(c, found.id);
    const st = await memberStats(c, u);
    if (st.issuedCount >= st.limit) fail(`${u.name} already has ${st.issuedCount} books — the ${u.role} limit is ${st.limit}.`);
    if (st.overdueCount > 0) fail(`${u.name} has ${st.overdueCount} overdue book(s). Return them first.`);
    if (st.unpaidFine > 0) fail(`${u.name} has an unpaid fine of ₹${st.unpaidFine}. Collect it first.`);
    if (await one(c, 'select 1 from transactions where user_id = $1 and book_id = $2 and return_date is null', [u.id, b.id])) fail(`${u.name} already has a copy of this book.`);

    const hold = await one(c, `select id from reservations where user_id = $1 and book_id = $2 and status = 'ready' for update`, [u.id, b.id]);
    if (hold) {
      // the copy was already set aside for them
      await c.query(`update reservations set status = 'fulfilled' where id = $1`, [hold.id]);
    } else {
      if (b.available <= 0) {
        const ready = await one(c, `select 1 from reservations where book_id = $1 and status = 'ready'`, [b.id]);
        fail(ready ? 'The free copy is on hold for another member who reserved it.' : 'No copies available. The member can reserve it instead.');
      }
      await c.query('update books set available = available - 1 where id = $1', [b.id]);
      await c.query(`update reservations set status = 'fulfilled' where user_id = $1 and book_id = $2 and status = 'waiting'`, [u.id, b.id]);
    }
    const id = await nextId(c, 'tx_seq', 'TX-', 4);
    const due = addDays(todayISO(), RULES[u.role].loanDays);
    await c.query(`insert into transactions (id, book_id, user_id, issue_date, due_date) values ($1, $2, $3, $4, $5)`, [id, b.id, u.id, todayISO(), due]);
    await notify(c, u.id, `"${b.title}" was issued to you. Due on ${fmtDate(due)}.`, 'info');
    return loan(c, id);
  });
}

// POST /api/transactions/:id/return  { finePaid }
export function returnBook(id, { finePaid = false } = {}) {
  return transaction(async (c) => {
    const tx = await one(c, `select ${TX} from transactions t where t.id = $1 for update`, [id]);
    if (!tx) fail('Transaction not found.', 404);
    if (tx.returnDate) fail('This book is already returned.');
    const fine = fineOf(tx);
    const paid = fine === 0 || !!finePaid;
    await c.query('update transactions set fine = $2, return_date = $3, fine_paid = $4 where id = $1', [id, fine, todayISO(), paid]);
    const b = await lockBook(c, tx.bookId);
    if (b) {
      await c.query('update books set available = available + 1 where id = $1', [b.id]);
      await promoteQueue(c, b.id);
    }
    if (fine > 0 && !paid) await notify(c, tx.userId, `Returned "${b ? b.title : ''}" late. Fine of ₹${fine} is pending.`, 'warn');
    return loan(c, id);
  });
}

// POST /api/transactions/:id/renew   (the member renews their own loan)
export function renew(id, userId) {
  return transaction(async (c) => {
    await housekeeping(c);
    const tx = await one(c, `select ${TX} from transactions t where t.id = $1 and t.user_id = $2 for update`, [id, userId]);
    if (!tx || tx.returnDate) fail('This book is not issued to you.');
    if (fineOf(tx) > 0) fail('Overdue books can\'t be renewed. Please return it at the desk.');
    if (tx.renewals >= RULES.maxRenewals) fail('You have already renewed this book once.');
    if (await one(c, `select 1 from reservations where book_id = $1 and status = 'waiting'`, [tx.bookId])) fail('Someone has reserved this book, so it can\'t be renewed.');
    const u = await findUser(c, userId);
    await c.query('update transactions set due_date = $2, renewals = renewals + 1 where id = $1', [id, addDays(tx.dueDate, RULES[u.role].loanDays)]);
    return loan(c, id);
  });
}

// ==================== reservations ====================

// POST /api/reservations  { bookId }   (for the signed-in member)
export function reserve(userId, bookId) {
  return transaction(async (c) => {
    await housekeeping(c);
    const u = await findUser(c, userId);
    if (!isMember(u)) fail('Only students and faculty can reserve.');
    const b = await lockBook(c, String(bookId || ''));
    if (!b) fail('Book not found.', 404);
    if (await one(c, `select 1 from reservations where user_id = $1 and book_id = $2 and status in ('waiting', 'ready')`, [u.id, b.id])) fail('You have already reserved this book.');
    if (await one(c, 'select 1 from transactions where user_id = $1 and book_id = $2 and return_date is null', [u.id, b.id])) fail('You already have this book.');
    const id = await nextId(c, 'rs_seq', 'RS-', 3);
    await c.query(`insert into reservations (id, book_id, user_id, date, status) values ($1, $2, $3, $4, 'waiting')`, [id, b.id, u.id, todayISO()]);
    await promoteQueue(c, b.id); // if a copy is free, it becomes "ready" right away
    const r = await one(c, `select ${RES} from reservations r where r.id = $1`, [id]);
    const position = r.status !== 'waiting' ? 0 : (await one(c, `select count(*)::int n from reservations x join reservations r on r.id = $1
      where x.book_id = r.book_id and x.status = 'waiting' and (x.date, x.created_at, x.id) <= (r.date, r.created_at, r.id)`, [id])).n;
    return { ...r, position };
  });
}

// DELETE /api/reservations/:id   (the member cancels their own)
export function cancelReservation(id, userId) {
  return transaction(async (c) => {
    const r = await one(c, `select ${RES} from reservations r where r.id = $1 and r.user_id = $2 for update`, [id, userId]);
    if (!r || (r.status !== 'waiting' && r.status !== 'ready')) fail('Reservation not found.', 404);
    await c.query(`update reservations set status = 'cancelled' where id = $1`, [id]);
    if (r.status === 'ready' && await lockBook(c, r.bookId)) {
      await c.query('update books set available = available + 1 where id = $1', [r.bookId]);
      await promoteQueue(c, r.bookId);
    }
    return { ...r, status: 'cancelled' };
  });
}

// ==================== librarian ====================

// GET /api/dashboard
export function dashboard() {
  return transaction(async (c) => {
    await housekeeping(c);
    const t = todayISO();
    const n = await one(c, `select
        (select coalesce(sum(total), 0)::int from books) as "totalBooks",
        (select count(*)::int from books) as titles,
        (select count(*)::int from books where added_on >= $2) as "addedThisWeek",
        (select count(*)::int from transactions where issue_date = $1) as "issuedToday",
        (select count(*)::int from transactions where return_date = $1) as "returnedToday",
        (select count(*)::int from transactions where return_date is null) as "onLoan",
        (select coalesce(sum(fine), 0)::int from transactions where return_date >= $3 and fine_paid) as "finesThisMonth",
        (select count(*)::int from users where role in ${MEMBER_ROLES}) as members,
        (select count(*)::int from reservations where status = 'waiting') as "waitingReservations"`,
    [t, addDays(t, -7), t.slice(0, 8) + '01']);
    const overdue = (await loans(c, 't.return_date is null and t.due_date < $1', [t])).sort((a, b) => b.fine - a.fine);
    const readyReservations = await all(c, `select ${RES},
        to_jsonb(bk) - 'added_on' || jsonb_build_object('addedOn', bk.added_on) as book,
        jsonb_build_object('id', u.id, 'role', u.role, 'name', u.name, 'dept', u.dept, 'email', u.email) as user
      from reservations r left join books bk on bk.id = r.book_id join users u on u.id = r.user_id
      where r.status = 'ready' order by r.hold_until, r.id`);
    const recent = (await loans(c, 'true', [],
      `case when t.return_date >= t.issue_date then t.return_date else t.issue_date end desc, t.id desc limit 6`))
      .map((x) => ({ ...x, when: x.returnDate && x.returnDate >= x.issueDate ? x.returnDate : x.issueDate, type: x.returnDate ? 'Returned' : 'Issued' }));
    return { ...n, overdue, readyReservations, recent };
  });
}

// GET /api/reports?period=week|month|semester
export function report(period = 'month') {
  return transaction(async (c) => {
    await housekeeping(c);
    const t = todayISO();
    const monthStart = (back) => { const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 - back, 1)); return d.toISOString().slice(0, 10); };
    const from = period === 'week' ? addDays(t, -6) : period === 'semester' ? monthStart(5) : monthStart(0);

    const issued = await loans(c, 't.issue_date >= $1', [from]);
    const returned = await loans(c, 't.return_date >= $1', [from]);

    const counts = await all(c, `select to_char(issue_date, 'YYYY-MM') as m, count(*)::int n from transactions
      where issue_date >= $1 group by 1`, [monthStart(5)]);
    const months = [5, 4, 3, 2, 1, 0].map((back) => {
      const start = monthStart(back);
      const hit = counts.find((r) => r.m === start.slice(0, 7));
      return { label: new Date(start + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), value: hit ? hit.n : 0 };
    });

    const catCount = {};
    issued.forEach((x) => { const k = x.book.category || 'Other'; catCount[k] = (catCount[k] || 0) + 1; });
    const totalCat = Object.values(catCount).reduce((a, b) => a + b, 0) || 1;
    const categories = Object.entries(catCount).sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: Math.round(count / totalCat * 100) }));

    const bookCount = {};
    issued.forEach((x) => { bookCount[x.bookId] = (bookCount[x.bookId] || 0) + 1; });
    const top = Object.entries(bookCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count], i) => {
      const x = issued.find((y) => y.bookId === id);
      return { rank: i + 1, id, title: x.book.category ? x.book.title : id, category: x.book.category || '—', count };
    });

    const members = await all(c, `select ${USER} from users u where u.role in ${MEMBER_ROLES}`);
    const stats = Object.values(await statsFor(c, members));
    const overdueNow = (await one(c, 'select count(*)::int n from transactions where return_date is null and due_date < $1', [t])).n;
    return {
      period, from,
      issued: issued.length,
      returned: returned.length,
      overdueNow,
      finesCollected: returned.filter((x) => x.finePaid).reduce((s, x) => s + x.fine, 0),
      finesPending: stats.reduce((s, m) => s + m.totalDue, 0),
      membersWithDues: stats.filter((m) => m.totalDue > 0).length,
      months, categories, top,
      rows: issued
    };
  });
}

// POST /api/notifications/reminders   (dashboard "Send reminders")
export function sendReminders() {
  return transaction(async (c) => {
    const overdue = await loans(c, 't.return_date is null and t.due_date < $1', [todayISO()]);
    for (const x of overdue) {
      const late = -x.daysLeft;
      await notify(c, x.userId, `Reminder: "${x.book.title}" is ${late} day${late === 1 ? '' : 's'} late. Fine so far: ${money(x.fine)}.`, 'warn');
    }
    return { sent: overdue.length };
  });
}

// POST /api/admin/reset   (put the demo data back)
export function resetDemo() {
  return transaction(async (c) => { await seed(c); return { reset: true }; });
}

// ==================== admin (user accounts) ====================

const ROLES = ['admin', 'librarian', 'student', 'faculty'];

// Validation shared by addUser / updateUser. Returns an error message or ''.
async function checkUser(c, d, isNew) {
  const name = String(d.name || '').trim(), email = String(d.email || '').trim().toLowerCase();
  if (isNew && !/^[A-Za-z0-9-]{3,20}$/.test(String(d.id || '').trim())) return 'ID must be 3–20 letters, numbers or dashes.';
  if (name.length < 2) return 'Enter the full name.';
  if (!/^[A-Za-z .'-]+$/.test(name)) return 'Name can only contain letters, spaces, dots and dashes.';
  if (!ROLES.includes(d.role)) return 'Pick a valid role.';
  if (!String(d.dept || '').trim()) return 'Enter the department.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (await one(c, 'select 1 from users where lower(email) = $1 and lower(id) <> lower($2)', [email, String(d.id || '').trim()])) return 'This email is already used by another account.';
  if (isNew && String(d.password || '').length < 6) return 'Password must be at least 6 characters.';
  return '';
}
const adminCount = async (c) => (await one(c, `select count(*)::int n from users where role = 'admin'`)).n;
const hasActiveLoans = async (c, id) => !!(await one(c, 'select 1 from transactions where user_id = $1 and return_date is null', [id]));

// GET /api/admin/overview
export function adminOverview() {
  return transaction(async (c) => {
    await housekeeping(c);
    const t = todayISO();
    const n = await one(c, `select
        (select count(*)::int from users) as users,
        (select count(*)::int from users where role = 'admin') as admins,
        (select count(*)::int from users where role = 'librarian') as librarians,
        (select count(*)::int from users where role = 'student') as students,
        (select count(*)::int from users where role = 'faculty') as faculty,
        (select count(*)::int from books) as titles,
        (select coalesce(sum(total), 0)::int from books) as copies,
        (select count(*)::int from transactions where return_date is null) as "onLoan",
        (select count(*)::int from transactions where return_date is null and due_date < $1) as overdue`, [t]);
    const members = await all(c, `select ${USER} from users u where u.role in ${MEMBER_ROLES}`);
    const finesPending = Object.values(await statsFor(c, members)).reduce((s, m) => s + m.totalDue, 0);
    const latestUsers = await all(c, `select ${USER} from users u order by u.created_at desc, u.id desc limit 5`);
    return { ...n, finesPending, rules: RULES, latestUsers };
  });
}

// GET /api/admin/users?q=&role=
export async function listUsers({ q = '', role = 'All' } = {}) {
  const s = String(q).trim().toLowerCase();
  return all(getPool(), `select ${USER},
      (select count(*)::int from transactions t where t.user_id = u.id and t.return_date is null) as "activeLoans"
    from users u
    where ($1 = 'All' or u.role = $1)
      and ($2 = '' or strpos(lower(u.name), $2) > 0 or strpos(lower(u.id), $2) > 0 or strpos(lower(u.dept), $2) > 0 or strpos(lower(u.email), $2) > 0)
    order by u.created_at, u.id`, [role || 'All', s]);
}

// POST /api/admin/users  { id, name, role, dept, email, password }
export function addUser(data = {}) {
  return transaction(async (c) => {
    const problem = await checkUser(c, data, true);
    if (problem) fail(problem);
    const id = String(data.id).trim().toUpperCase();
    if (await findUser(c, id)) fail('A user with this ID already exists.');
    await c.query('insert into users (id, password_hash, role, name, dept, email) values ($1, $2, $3, $4, $5, $6)', [
      id, await bcrypt.hash(String(data.password), 10), data.role, String(data.name).trim(), String(data.dept).trim(), String(data.email).trim().toLowerCase()]);
    return findUser(c, id);
  });
}

// PUT /api/admin/users/:id  { name, role, dept, email }
export function updateUser(id, data = {}) {
  return transaction(async (c) => {
    const u = await findUser(c, id);
    if (!u) fail('User not found.', 404);
    const problem = await checkUser(c, { ...data, id: u.id }, false);
    if (problem) fail(problem);
    if (data.role !== u.role) {
      if (await hasActiveLoans(c, u.id) && !isMember({ role: data.role })) fail('This user still has books issued. They must be returned before changing the role.');
      if (u.role === 'admin' && await adminCount(c) === 1) fail('There must be at least one administrator.');
    }
    await c.query('update users set name = $2, role = $3, dept = $4, email = $5 where id = $1', [
      u.id, String(data.name).trim(), data.role, String(data.dept).trim(), String(data.email).trim().toLowerCase()]);
    return findUser(c, u.id);
  });
}

// POST /api/admin/users/:id/reset-password  { password }
export function resetPassword(id, password) {
  return transaction(async (c) => {
    const u = await findUser(c, id);
    if (!u) fail('User not found.', 404);
    if (String(password || '').length < 6) fail('Password must be at least 6 characters.');
    await c.query('update users set password_hash = $2 where id = $1', [u.id, await bcrypt.hash(String(password), 10)]);
    return true;
  });
}

// DELETE /api/admin/users/:id
export function deleteUser(id, byAdminId) {
  return transaction(async (c) => {
    const u = await findUser(c, id);
    if (!u) fail('User not found.', 404);
    if (u.id.toLowerCase() === String(byAdminId).toLowerCase()) fail('You can\'t delete your own account.');
    if (u.role === 'admin' && await adminCount(c) === 1) fail('There must be at least one administrator.');
    if (await hasActiveLoans(c, u.id)) fail('This user still has books issued. They must be returned first.');
    if (isMember(u) && (await memberStats(c, u)).totalDue > 0) fail('This user has unpaid fines. Collect them first.');
    // Cancel their reservations; a copy that was set aside for them goes back to the queue.
    const ready = await all(c, `select book_id from reservations where user_id = $1 and status = 'ready' for update`, [u.id]);
    await c.query(`update reservations set status = 'cancelled' where user_id = $1 and status in ('waiting', 'ready')`, [u.id]);
    for (const r of ready) {
      if (await lockBook(c, r.book_id)) {
        await c.query('update books set available = available + 1 where id = $1', [r.book_id]);
        await promoteQueue(c, r.book_id);
      }
    }
    await c.query('delete from users where id = $1', [u.id]);
    return { deleted: u.id };
  });
}
