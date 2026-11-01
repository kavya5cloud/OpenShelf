# OpenShelf — Library Management System

A role-based library management system for colleges. The **administrator**, **librarian**, **students** and **faculty** each get their own dashboard.

Built with plain **HTML, CSS and JavaScript** in a warm "reading room" design: no framework and no build step. The backend is a single **Vercel Function** (Node.js) with a **Postgres** database. It creates its own tables and demo data the first time it runs.

## Demo logins

| Role      | ID         | Password     |
|-----------|------------|--------------|
| Admin     | `ADM-001`  | `superadmin123` (sign in at `admin-login.html`) |
| Librarian | `LIB-001`  | `admin123`   |
| Student   | `24BCS001` | `student123` |
| Faculty   | `FAC-1024` | `faculty123` |

More students: `24BCS014`, `24BCE027`, `23BME009`, `24BIT033`, `25BCS041` (all `student123`). Faculty: `FAC-2051` (`faculty123`).

**Reset demo data** in the librarian's or admin's sidebar puts everything back to the starting sample data, for everyone.

## Features

**Everyone**
- Role-based login (Librarian / Student / Faculty)
- Book catalog with search (title, author, ISBN, ID), category filters, sorting and an "available only" filter

**Student / Faculty**
- **My Shelf**: books standing on bookshelves, grouped into Currently reading (with loan progress), Up next (reservations), Listen, Finished and Recommended for you. There's also an "All books" view and search.
- **Audiobooks** ⭐: short spoken summaries of books, read aloud by the browser (Web Speech API, no audio files needed). Includes chapters, play/pause, speed (0.8×–1.5×), voice choice, **read-along highlighting**, click-a-sentence-to-jump, and resume from where you stopped. A "Continue listening" card sits in the sidebar.
- Dashboard: issued books, next due date, fines, reservations, notifications
- **Reservations with a queue**: if a copy is free it's held for 2 days, otherwise you join the queue and get notified when it's your turn
- **Online renewal**: once per book, only if it isn't overdue and nobody is waiting for it
- **Due-date reminders**: shown when a book is due within 2 days
- Borrowing history with fine status

**Administrator** (separate login page: `admin-login.html`, linked from the sign-in page)
- Admin dashboard: total accounts, accounts by role, books, overdue loans, dues and library rules
- **User management**: add, edit and delete accounts for librarians, students, faculty and other admins, with validation (unique ID and email, valid email, letters-only names)
- **Reset password** for any user
- Safety checks: can't delete yourself, can't remove the last admin, can't delete or change the role of a user who still has books or unpaid fines
- Can also manage books and view reports

**Librarian**
- Dashboard: totals, today's activity, overdue list, books ready for pickup, "Send reminders"
- **Issue / Return**: live preview of the member and book, rule checks, and **automatic fine calculation** (₹5/day)
- Manage books: add, edit and delete, with validation
- Members: loans, overdue books and dues; collect fines
- **Reports**: issues per month chart, category split, most borrowed books, fines; **export CSV** and **PDF** (print)

**Library rules** (change them in `js/store.js` → `OS.RULES`)
- Student: 4 books, 14 days · Faculty: 10 books, 30 days
- Fine: ₹5 per late day · Reservation hold: 2 days · Max renewals: 1
- A member can't borrow if they hit their limit, have an overdue book, or have an unpaid fine

## Folder structure

```
index.html            Home page (hero) with "Log in"
login.html            Sign in
dashboard.html        Dashboard (different for librarian vs student/faculty)
catalog.html          Catalog / Manage books
issue-return.html     Issue & return (librarian)
members.html          Members (librarian)
reports.html          Reports (librarian)
my-books.html         My books, history, fines (student/faculty)
reservations.html     Reservations (student/faculty)
library.html          My Shelf: bookshelf view (student/faculty)
admin-login.html      Admin sign in
users.html            User accounts (admin)
audiobooks.html       Audiobook player with read-along (everyone)
css/style.css         App styles (colors at the top in :root)
css/home.css          Home page styles
js/api.js             Calls the backend. Pages only get data through this file.
js/store.js           Library rules + date helpers
js/audiobooks.js      Audiobook summaries (chapters) + listening progress
js/ui.js              Sidebar, login session, toasts, dialogs, icons
js/pages/*.js         One script per page

api/index.js          The backend: every /api/* route, and who may call it
api/_lib/service.js   Library logic (issue, return, fines, reservation queue…)
api/_lib/schema.js    Database tables
api/_lib/seed.js      Demo data
api/_lib/rules.js     Library rules the server enforces
API.md                Endpoint list
```

## Deploy on Vercel (about 5 minutes, no commands)

1. **Import the repo.** On https://vercel.com/new, import this GitHub repo. Leave every setting as it is and click **Deploy**. (The site loads, but books won't show yet, because there's no database.)
2. **Add a database.** In the project, open the **Storage** tab → **Create Database** → **Neon** (Serverless Postgres) → pick the free plan → **Connect** it to the project. This sets `DATABASE_URL` for you.
3. **Redeploy.** Go to **Deployments**, open the menu (⋯) on the latest one, and click **Redeploy**.

That's it. On the first visit, the backend creates its tables and loads the demo data. Log in with the demo accounts above.

*Optional:* add an environment variable `AUTH_SECRET` (any long random string) under **Settings → Environment Variables**. Without it, login tokens are signed with a secret derived from the database URL, which is also fine.

## Run it locally

You need **Node.js 20+** and a Postgres database. The easiest is a free Neon database (https://neon.tech): copy its connection string.

```
npm install
cp .env.example .env        # then paste your connection string into DATABASE_URL
npm run dev
```

Open http://localhost:3000. Tables and demo data are created on the first request.

To wipe the database and start again from the demo data: `npm run db:reset` (or use **Reset demo data** in the librarian's or admin's sidebar).

## Changing a library rule

Change it in **both** `api/_lib/rules.js` (the server enforces it) and `OS.RULES` in `js/store.js` (the pages display it).

## Notes

- **Book covers:** real covers load from Open Library by ISBN when the site is online. If they can't load, a designed cover is drawn from the book's color and title. To always use designed covers, set `OS.coversOnline = false` in `js/ui.js`.
- **Audiobooks** use the voices installed on the device. Chrome and Edge have the most voices; on phones it uses the phone's voice. An Indian-English voice is picked first if one is available.
