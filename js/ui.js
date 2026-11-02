/* OpenShelf — shared UI: session, sidebar, icons, toasts, dialogs, small helpers */
window.OS = window.OS || {};

(function (OS) {
  // ---------- session ----------
  const SKEY = 'openshelf_session';
  OS.session = {
    get() { try { return JSON.parse(localStorage.getItem(SKEY)); } catch (e) { return OS._sess || null; } },
    set(u) { OS._sess = u; try { localStorage.setItem(SKEY, JSON.stringify(u)); } catch (e) { /* ignore */ } },
    clear() { OS._sess = null; try { localStorage.removeItem(SKEY); } catch (e) { /* ignore */ } }
  };

  // Call at the top of every protected page. Redirects to login if needed.
  OS.requireAuth = function (roles) {
    const u = OS.session.get();
    if (!u) { location.replace(roles && roles.length === 1 && roles[0] === 'admin' ? 'admin-login.html' : 'login.html'); return null; }
    if (roles && !roles.includes(u.role)) { location.replace('dashboard.html'); return null; }
    return u;
  };
  OS.logout = function () { OS.session.clear(); location.href = 'index.html'; };

  // ---------- helpers ----------
  OS.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  OS.money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  OS.initials = (name) => String(name || '?').replace(/^(Dr\.|Prof\.)\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  OS.roleBadge = (r) => ({ admin: 'red', librarian: 'green', student: 'blue', faculty: 'amber' }[r] || 'gray');
  OS.roleLabel = (r) => ({ admin: 'Administrator', librarian: 'Librarian', student: 'Student', faculty: 'Faculty' }[r] || r);
  // Book cover: a designed cover from the book's color + title, with the real
  // cover (Open Library, by ISBN) layered on top when the network allows it.
  OS.coversOnline = true; // set false to always use designed covers
  OS.cover = (b, size = '') => {
    const big = size === 'lg' || size === 'xl';
    const img = OS.coversOnline && b.isbn
      ? `<img class="cover-img" src="https://covers.openlibrary.org/b/isbn/${encodeURIComponent(b.isbn)}-${big ? 'L' : 'M'}.jpg?default=false" alt="" loading="lazy">`
      : '';
    return `<div class="cover ${size}" style="--c:${OS.esc(b.color || '#5F5BC4')}" aria-hidden="true"><span class="ct">${OS.esc(b.title)}</span><span class="ca">${OS.esc(String(b.author || '').split(',')[0])}</span>${img}</div>`;
  };
  // If a real cover can't load (offline, blocked, missing), quietly fall back.
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('cover-img')) t.remove();
  }, true);
  document.addEventListener('load', (e) => {
    const t = e.target; // Open Library sometimes returns a 1×1 placeholder
    if (t && t.classList && t.classList.contains('cover-img') && t.naturalWidth < 10) t.remove();
  }, true);
  OS.$ = (sel, root = document) => root.querySelector(sel);
  OS.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  OS.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  OS.dueText = (tx) => {
    if (tx.returnDate) return 'Returned ' + OS.fmtDate(tx.returnDate);
    if (tx.daysLeft < 0) return `${-tx.daysLeft} day${tx.daysLeft === -1 ? '' : 's'} late`;
    if (tx.daysLeft === 0) return 'Due today';
    return `Due in ${tx.daysLeft} day${tx.daysLeft === 1 ? '' : 's'}`;
  };

  // ---------- icons (inline SVG, stroke = currentColor) ----------
  const P = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    library: '<path d="M5 4v16M9 4v16M14 5l4 15M3 20h18"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    rupee: '<path d="M6 4h12M6 9h12M14 4c3 0 4 2.5 4 5s-2 5-6 5H6l9 7"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    scan: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
    shelf: '<path d="M3 21h18M5 21V5h3v16M10 21V8h3v13M15.5 8.5l3-.8 3.3 12.6"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
    back: '<path d="M11 18l-6-6 6-6M19 18l-6-6 6-6"/>',
    fwd: '<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>'
  };
  OS.icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  // The OpenShelf wordmark. light = white version, for dark backgrounds.
  OS.wordmark = (height = 30, light = false) => `<img class="wordmark" src="img/logo${light ? '-light' : ''}.png" alt="OpenShelf" height="${height}">`;

  // ---------- app shell (sidebar + mobile top bar) ----------
  const NAV = {
    admin: [
      ['dashboard', 'dashboard.html', 'Admin Dashboard', 'grid'],
      ['users', 'users.html', 'Users', 'users'],
      ['catalog', 'catalog.html', 'Books', 'book'],
      ['reports', 'reports.html', 'Reports', 'chart']
    ],
    librarian: [
      ['dashboard', 'dashboard.html', 'Dashboard', 'grid'],
      ['catalog', 'catalog.html', 'Books', 'book'],
      ['issue', 'issue-return.html', 'Issue / Return', 'swap'],
      ['members', 'members.html', 'Members', 'users'],
      ['reports', 'reports.html', 'Reports', 'chart']
    ],
    member: [
      ['dashboard', 'dashboard.html', 'Home', 'grid'],
      ['shelf', 'library.html', 'My Shelf', 'shelf'],
      ['catalog', 'catalog.html', 'Catalog', 'book'],
      ['audio', 'audiobooks.html', 'Audiobooks', 'headphones'],
      ['reservations', 'reservations.html', 'Reservations', 'bookmark'],
      ['mybooks', 'my-books.html', 'Fines', 'library']
    ]
  };
  NAV.librarian.splice(2, 0, ['audio', 'audiobooks.html', 'Audiobooks', 'headphones']);

  // "Continue listening" card for the sidebar (uses audiobooks.js progress).
  // Drawn empty, then filled once the book's details arrive from the API.
  function continueCard(active) {
    if (active === 'audio' || !OS.audioProgress || !OS.AUDIOBOOKS) return '';
    const p = OS.audioProgress.get();
    if (!p.last || !OS.AUDIOBOOKS[p.last]) return '';
    return `<a class="side-card" id="continueCard" href="audiobooks.html#${OS.esc(p.last)}" hidden></a>`;
  }
  function fillContinueCard() {
    const card = OS.$('#continueCard');
    if (!card) return;
    const id = OS.audioProgress.get().last;
    OS.api.getBook(id).then((b) => {
      const pct = OS.audioProgress.percent(id);
      card.innerHTML = `<span class="lbl">Continue listening</span>
        ${OS.cover(b, 'lg')}
        <span class="progress" aria-label="${pct}% listened"><span style="width:${pct}%"></span></span>`;
      card.hidden = false;
    }).catch(() => {});
  }

  OS.shell = function (active) {
    const u = OS.session.get();
    const items = NAV[OS.isMember(u) ? 'member' : u.role] || NAV.member;
    const content = OS.$('#content');
    const app = document.createElement('div');
    app.className = 'app';
    app.id = 'app';
    app.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="dashboard.html">${OS.wordmark(30)}</a>
        <nav class="nav" aria-label="Main">
          ${items.map(([key, href, label, ic]) => `<a href="${href}" class="${key === active ? 'active' : ''}" ${key === active ? 'aria-current="page"' : ''}>${OS.icon(ic)}${label}</a>`).join('')}
        </nav>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:12px">
          ${continueCard(active)}
          ${OS.isStaff(u) ? `<a href="#" id="resetDemo" class="reset-link">${OS.icon('refresh', 16)}Reset demo data</a>` : ''}
        </div>
        <div class="sidebar-user">
          <span class="avatar">${OS.esc(OS.initials(u.name))}</span>
          <span class="who"><b>${OS.esc(u.name)}</b><small>${OS.roleLabel(u.role)} · ${OS.esc(u.id)}</small></span>
          <button type="button" id="logoutBtn" aria-label="Log out" title="Log out">${OS.icon('logout')}</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <a class="brand" href="dashboard.html">${OS.wordmark(24)}</a>
          <button type="button" id="menuBtn" aria-label="Open menu" aria-expanded="false">${OS.icon('menu')}</button>
        </header>
      </div>`;
    content.parentNode.insertBefore(app, content);
    app.querySelector('.main').appendChild(content);

    OS.$('#logoutBtn').addEventListener('click', OS.logout);
    if (OS.$('#resetDemo')) OS.$('#resetDemo').addEventListener('click', async (e) => {
      e.preventDefault();
      if (await OS.confirm('Reset demo data?', 'All books, loans and reservations go back to the starting sample data — for everyone.', 'Reset')) {
        try { await OS.api.resetDemo(); location.reload(); } catch (err) { OS.toast(err.message, 'error'); }
      }
    });
    fillContinueCard();
    // Badge on "Reservations" when a reserved book is waiting at the desk.
    if (OS.isMember(u)) {
      OS.api.memberSummary(u.id).then((s) => {
        const ready = s.reservations.filter((r) => r.status === 'ready').length;
        const link = OS.$('#sidebar a[href="reservations.html"]');
        if (ready && link) link.insertAdjacentHTML('beforeend', `<span class="count">${ready}</span>`);
      }).catch(() => {});
    }
    const menuBtn = OS.$('#menuBtn');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = app.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (app.classList.contains('nav-open') && !OS.$('#sidebar').contains(e.target)) {
        app.classList.remove('nav-open'); menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
    if (!document.querySelector('.toasts')) {
      const t = document.createElement('div'); t.className = 'toasts'; t.setAttribute('aria-live', 'polite'); document.body.appendChild(t);
    }
  };

  // ---------- toasts ----------
  OS.toast = function (msg, type = 'info') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = OS.icon(type === 'error' ? 'alert' : 'check', 18) + '<span>' + OS.esc(msg) + '</span>';
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
  };

  // ---------- dialogs ----------
  // OS.modal({ title, body (html), okLabel, okClass, onOk(form) → Promise|false })
  OS.modal = function ({ title, body, okLabel = 'Save', okClass = 'btn-primary', cancelLabel = 'Cancel', onOk }) {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.innerHTML = `
      <form method="dialog" novalidate>
        <div class="modal-head"><h2>${OS.esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${OS.icon('x', 18)}</button></div>
        <div class="modal-body">${body}<p class="error-text" data-error hidden></p></div>
        <div class="modal-foot"><button type="button" class="btn btn-outline" data-close>${OS.esc(cancelLabel)}</button><button type="submit" class="btn ${okClass}">${OS.esc(okLabel)}</button></div>
      </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const err = dlg.querySelector('[data-error]');
    return new Promise((resolve) => {
      const close = (val) => { dlg.close(); dlg.remove(); resolve(val); };
      dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(false)));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.hidden = true;
        try {
          const res = onOk ? await onOk(form) : true;
          if (res !== false) close(res === undefined ? true : res);
        } catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
      dlg.showModal();
      const first = dlg.querySelector('.modal-body input, .modal-body select');
      if (first) first.focus();
    });
  };

  OS.confirm = (title, text, okLabel = 'Confirm', danger = false) =>
    OS.modal({ title, body: `<p class="muted">${OS.esc(text)}</p>`, okLabel, okClass: danger ? 'btn-danger' : 'btn-primary' });
})(window.OS);
