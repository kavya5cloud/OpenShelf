/* OpenShelf — API layer
   ---------------------------------------------------------------
   Every page talks to data ONLY through these functions. Each one calls the
   backend endpoint written above it (see API.md; the server lives in api/).
   Every function returns a Promise, and a failed request rejects with an
   Error whose message is safe to show to the user.
*/
window.OS = window.OS || {};

(function (OS) {
  // Same origin by default. Set to e.g. 'https://openshelf.vercel.app' to use a remote API.
  OS.CONFIG = { BASE_URL: '' };

  async function http(method, path, body) {
    const s = OS.session && OS.session.get();
    const headers = { 'Content-Type': 'application/json' };
    if (s && s.token) headers.Authorization = 'Bearer ' + s.token;
    let res;
    try {
      res = await fetch(OS.CONFIG.BASE_URL + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error('Can\'t reach the server. Check your connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    // Expired or missing login: start a fresh session.
    if (res.status === 401 && s) { OS.session.clear(); location.replace('login.html'); }
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  }
  const id = encodeURIComponent;
  const query = (params) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, v); });
    const s = q.toString();
    return s ? '?' + s : '';
  };

  OS.fmtDate = (iso) => {
    if (!iso) return '—';
    const d = OS.parseISO(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  OS.api = {
    // POST /api/auth/login  { id, password, role }  → user + token
    login(userId, password, role) {
      return http('POST', '/auth/login', { id: userId, password, role });
    },

    // GET /api/books/categories
    categories() {
      return http('GET', '/books/categories');
    },

    // GET /api/books?q=&category=&sort=&availableOnly=
    listBooks({ q, category, sort, availableOnly } = {}) {
      return http('GET', '/books' + query({ q, category, sort, availableOnly: availableOnly ? 'true' : '' }));
    },

    // GET /api/books/:id   (id or ISBN)
    getBook(bookId) {
      return http('GET', '/books/' + id(String(bookId).trim()));
    },

    // POST /api/books
    addBook(data) {
      return http('POST', '/books', data);
    },

    // PUT /api/books/:id
    updateBook(bookId, data) {
      return http('PUT', '/books/' + id(bookId), data);
    },

    // DELETE /api/books/:id
    deleteBook(bookId) {
      return http('DELETE', '/books/' + id(bookId));
    },

    // GET /api/members?q=&role=   (librarian)
    listMembers({ q, role } = {}) {
      return http('GET', '/members' + query({ q, role }));
    },

    // GET /api/members/:id
    getMember(userId) {
      return http('GET', '/members/' + id(String(userId).trim()));
    },

    // GET /api/members/:id/summary   (everything a student/faculty dashboard needs)
    memberSummary(userId) {
      return http('GET', '/members/' + id(userId) + '/summary');
    },

    // POST /api/transactions/issue  { userId, bookId }
    issueBook(userId, bookId) {
      return http('POST', '/transactions/issue', { userId, bookId });
    },

    // POST /api/transactions/:id/return  { finePaid }
    returnBook(txId, { finePaid = false } = {}) {
      return http('POST', '/transactions/' + id(txId) + '/return', { finePaid });
    },

    // POST /api/transactions/:id/renew   (the server renews for the signed-in member)
    renew(txId) {
      return http('POST', '/transactions/' + id(txId) + '/renew');
    },

    // POST /api/reservations  { bookId }   (for the signed-in member)
    reserve(userId, bookId) {
      return http('POST', '/reservations', { bookId });
    },

    // DELETE /api/reservations/:id   (the signed-in member's own)
    cancelReservation(resId) {
      return http('DELETE', '/reservations/' + id(resId));
    },

    // POST /api/members/:id/pay-fines   (librarian collects cash)
    payFines(userId) {
      return http('POST', '/members/' + id(userId) + '/pay-fines');
    },

    // PATCH /api/members/:id/notifications/read
    markNotificationsRead(userId) {
      return http('PATCH', '/members/' + id(userId) + '/notifications/read');
    },

    // GET /api/dashboard   (librarian)
    dashboard() {
      return http('GET', '/dashboard');
    },

    // GET /api/members/:id/active-loans   (used on the Return screen)
    activeLoans(userId) {
      return http('GET', '/members/' + id(String(userId).trim()) + '/active-loans');
    },

    // GET /api/reports?period=week|month|semester
    report(period = 'month') {
      return http('GET', '/reports' + query({ period }));
    },

    // POST /api/notifications/reminders   (librarian: remind everyone with an overdue book)
    sendReminders() {
      return http('POST', '/notifications/reminders');
    },

    // POST /api/admin/reset   (librarian: put the demo data back)
    resetDemo() {
      return http('POST', '/admin/reset');
    }
  };
})(window.OS);
