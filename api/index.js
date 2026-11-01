// OpenShelf API: one Vercel Function serves every /api/* route (vercel.json
// rewrites /api/<path> to /api; the request keeps its original URL, so the
// route is read from it). Routes and shapes follow API.md.
//
// Who can call what:
//   public     anyone (the catalog is browsable before logging in)
//   librarian  librarians only
//   staff      librarians and admins
//   admin      admins only
//   self       the member named in the URL, or staff
//   member     any signed-in student or faculty, acting as themselves
import * as S from './_lib/service.js';
import { ApiError, ensureDatabase } from './_lib/db.js';
import { verifyToken } from './_lib/auth.js';

const routes = [
  ['POST', '/auth/login', 'public', (r) => S.login(r.body)],

  ['GET', '/books/categories', 'public', () => S.categories()],
  ['GET', '/books', 'public', (r) => S.listBooks(r.query)],
  ['GET', '/books/:id', 'public', (r) => S.getBook(r.params.id)],
  ['POST', '/books', 'staff', (r) => S.addBook(r.body)],
  ['PUT', '/books/:id', 'staff', (r) => S.updateBook(r.params.id, r.body)],
  ['DELETE', '/books/:id', 'staff', (r) => S.deleteBook(r.params.id)],

  ['GET', '/members', 'librarian', (r) => S.listMembers(r.query)],
  ['GET', '/members/:id', 'librarian', (r) => S.getMember(r.params.id)],
  ['GET', '/members/:id/summary', 'self', (r) => S.memberSummary(r.params.id)],
  ['GET', '/members/:id/active-loans', 'librarian', (r) => S.activeLoans(r.params.id)],
  ['POST', '/members/:id/pay-fines', 'librarian', (r) => S.payFines(r.params.id)],
  ['PATCH', '/members/:id/notifications/read', 'self', (r) => S.markNotificationsRead(r.params.id)],

  ['POST', '/transactions/issue', 'librarian', (r) => S.issueBook(r.body)],
  ['POST', '/transactions/:id/return', 'librarian', (r) => S.returnBook(r.params.id, r.body)],
  ['POST', '/transactions/:id/renew', 'member', (r) => S.renew(r.params.id, r.user.sub)],

  ['POST', '/reservations', 'member', (r) => S.reserve(r.user.sub, r.body.bookId)],
  ['DELETE', '/reservations/:id', 'member', (r) => S.cancelReservation(r.params.id, r.user.sub)],

  ['GET', '/dashboard', 'librarian', () => S.dashboard()],
  ['GET', '/reports', 'staff', (r) => S.report(r.query.period)],
  ['POST', '/notifications/reminders', 'librarian', () => S.sendReminders()],
  ['POST', '/admin/reset', 'staff', () => S.resetDemo()],

  ['GET', '/admin/overview', 'admin', () => S.adminOverview()],
  ['GET', '/admin/users', 'admin', (r) => S.listUsers(r.query)],
  ['POST', '/admin/users', 'admin', (r) => S.addUser(r.body)],
  ['PUT', '/admin/users/:id', 'admin', (r) => S.updateUser(r.params.id, r.body)],
  ['POST', '/admin/users/:id/reset-password', 'admin', (r) => S.resetPassword(r.params.id, r.body.password)],
  ['DELETE', '/admin/users/:id', 'admin', (r) => S.deleteUser(r.params.id, r.user.sub)]
].map(([method, path, access, run]) => {
  const names = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
  return { method, re, names, access, run };
});

function allowed(access, user, params) {
  if (access === 'public') return true;
  if (!user) return false;
  const staff = user.role === 'librarian' || user.role === 'admin';
  if (access === 'librarian') return user.role === 'librarian';
  if (access === 'staff') return staff;
  if (access === 'admin') return user.role === 'admin';
  if (access === 'member') return user.role === 'student' || user.role === 'faculty';
  if (access === 'self') return staff || user.sub.toLowerCase() === String(params.id).toLowerCase();
  return false;
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = '/' + url.pathname.replace(/^\/api\/?/, '').replace(/^\/+|\/+$/g, '');
  url.searchParams.delete('path'); // Vercel adds the rewrite's :path as a query parameter

  let params = null;
  const route = routes.find((r) => {
    if (r.method !== req.method) return false;
    const m = path.match(r.re);
    if (m) params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    return !!m;
  });
  if (!route) return send(res, routes.some((r) => r.re.test(path)) ? 405 : 404, { message: 'Not found.' });

  const header = req.headers.authorization || '';
  const user = header.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
  if (!allowed(route.access, user, params)) {
    return user ? send(res, 403, { message: 'You don\'t have access to that.' }) : send(res, 401, { message: 'Please log in again.' });
  }

  try {
    await ensureDatabase();
    let body = {};
    try { body = await readBody(req); } catch (e) { return send(res, 400, { message: 'Request body must be JSON.' }); }
    const data = await route.run({ params, query: Object.fromEntries(url.searchParams), body, user });
    send(res, 200, data);
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { message: e.message });
    console.error(e);
    send(res, 500, { message: 'Something went wrong on the server. Please try again.' });
  }
}
