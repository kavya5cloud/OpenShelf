# OpenShelf — Library Management System (Frontend)

A role-based library management system for colleges. The **administrator**, **librarian**, **students** and **faculty** each get their own dashboard.

Built with plain **HTML, CSS and JavaScript** in a warm "reading room" design,: no framework and no build step. It works fully right now using a **dummy database** that is saved in the browser (localStorage). When the backend is ready, only `js/api.js` needs to change.

## Demo logins

| Role      | ID         | Password     |
|-----------|------------|--------------|
| Admin     | `ADM-001`  | `superadmin123` (sign in at `admin-login.html`) |
| Librarian | `LIB-001`  | `admin123`   |
| Student   | `24BCS001` | `student123` |
| Faculty   | `FAC-1024` | `faculty123` |

More students: `24BCS014`, `24BCE027`, `23BME009`, `24BIT033`, `25BCS041` (all `student123`). Faculty: `FAC-2051` (`faculty123`).

**Reset demo data** in the sidebar puts everything back to the starting sample data.

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
index.html            Login
dashboard.html        Dashboard (different for librarian vs student/faculty)
catalog.html          Catalog / Manage books
issue-return.html     Issue & return (librarian)
members.html          Members (librarian)
reports.html          Reports (librarian)
my-books.html         My books, history, fines (student/faculty)
reservations.html     Reservations (student/faculty)
library.html          My Shelf: bookshelf view (student/faculty)
audiobooks.html       Audiobook player with read-along (everyone)
css/style.css         All styles (colors at the top in :root)
js/store.js           Dummy database + library rules
js/audiobooks.js      Audiobook summaries (chapters) + listening progress
js/api.js             API layer: the ONLY file to change when the backend is ready
js/ui.js              Sidebar, login session, toasts, dialogs, icons
js/pages/*.js         One script per page
API.md                Endpoint list for the backend team
```

## Run it locally

Option 1: just double-click `index.html`.

Option 2 (recommended, behaves like a real server):
```
cd openshelf
python -m http.server 8000
```
Then open http://localhost:8000. In VS Code, the **Live Server** extension also works.

## Deploy (free)

**Netlify (easiest):** go to https://app.netlify.com/drop and drag the whole `openshelf` folder in. You'll get a live link right away.

**GitHub Pages:**
1. Create a repo and push these files (with `index.html` at the root).
2. Go to Settings → Pages → Source: *Deploy from a branch* → `main` / root → Save.
3. Your site will be at `https://<username>.github.io/<repo>/`.

**Vercel:** import the GitHub repo and choose the "Other" framework preset. No build command is needed.

## Connecting the real backend

1. Your backend teammate builds the endpoints listed in `API.md`.
2. In `js/api.js`, set `OS.CONFIG.BASE_URL` (for example `http://localhost:5000`).
3. Replace the body of each function with the `http()` call for its endpoint. The endpoint is written in a comment above every function. Pages don't change, because every function already returns a Promise.

## Notes

- **Book covers:** real covers load from Open Library by ISBN when the site is online. If they can't load, a designed cover is drawn from the book's color and title. To always use designed covers, set `OS.coversOnline = false` in `js/ui.js`.
- **Audiobooks** use the voices installed on the device. Chrome and Edge have the most voices; on phones it uses the phone's voice. An Indian-English voice is picked first if one is available.
