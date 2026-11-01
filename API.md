# OpenShelf — API

The backend lives in `api/` (one Vercel Function) and the frontend calls it through `js/api.js`. All requests and responses are JSON.
Errors return a 4xx status with `{ "message": "Human readable reason" }`. The frontend shows that message to the user.

## Logging in

`POST /api/auth/login` returns the user plus a `token`. Send it on every other request:

```
Authorization: Bearer <token>
```

Tokens last 7 days. A missing, expired or tampered token gets **401** (the frontend then sends the user back to the login page). A valid token for the wrong role gets **403**.

**Who can call what** (the Access column below):

| Access | Meaning |
|---|---|
| public | anyone, no token needed |
| librarian | librarians only |
| staff | librarians and admins |
| admin | admins only |
| self | the member in the URL, or a librarian |
| member | a signed-in student or faculty member, acting as themselves (the server uses the token, not the body) |

## Database tables

**users**: `id` (PK, e.g. 24BCS001 / FAC-1024 / LIB-001 / ADM-001), `password_hash` (bcrypt), `role` (admin | librarian | student | faculty), `name`, `dept`, `email`

**books**: `id` (PK, BK-001), `isbn`, `title`, `author`, `category`, `total`, `available`, `shelf`, `year`, `color`, `addedOn`

**transactions**: `id` (PK, TX-0001), `bookId` (FK), `userId` (FK), `issueDate`, `dueDate`, `returnDate` (null while issued), `renewals`, `fine`, `finePaid`

**reservations**: `id` (PK, RS-001), `bookId` (FK), `userId` (FK), `date`, `status` (waiting | ready | fulfilled | cancelled | expired), `holdUntil`

**notifications**: `id`, `userId` (FK), `date`, `type` (info | success | warn), `text`, `read`

Dates are `YYYY-MM-DD` strings.

## Business rules (`api/_lib/rules.js`, shown in the UI from `OS.RULES` in js/store.js)

| Rule | Value |
|---|---|
| Student limit / loan | 4 books / 14 days |
| Faculty limit / loan | 10 books / 30 days |
| Late fine | ₹5 per day after the due date |
| Reservation hold | 2 days, then it expires and the next person in the queue gets it |
| Renewals | 1 per loan; not allowed if the book is overdue or someone is waiting for it |
| Can't issue if | limit reached, any overdue book, an unpaid fine, or the member already has a copy of this book |

**Reservation queue:** when a book is returned (or a hold expires or is cancelled) and someone is `waiting`, the earliest reservation becomes `ready`, `holdUntil` = today + 2, and that copy is **not** counted as available.

## Endpoints

| Method | Path | Body / query | Returns | Access |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{ id, password, role }` | user (no password) + `token` | public |
| GET | `/api/books` | `?q=&category=&sort=title\|popular\|newest\|available&availableOnly=true` | book[] (+ `timesIssued`, `queue`) | public |
| GET | `/api/books/categories` | | string[] | public |
| GET | `/api/books/:id` | (id or ISBN) | book | public |
| POST | `/api/books` | `{ title, author, isbn, category, total, shelf, year }` | book | staff |
| PUT | `/api/books/:id` | same as POST | book | staff |
| DELETE | `/api/books/:id` | | `{ deleted }` (blocked if copies are out) | staff |
| GET | `/api/members` | `?q=&role=` | member[] with stats | librarian |
| GET | `/api/members/:id` | | member + stats | librarian |
| GET | `/api/members/:id/summary` | | `{ user, stats, issued[], history[], reservations[], notifications[] }` | self |
| GET | `/api/members/:id/active-loans` | | transaction[] | librarian |
| POST | `/api/members/:id/pay-fines` | | `{ amount }` | librarian |
| PATCH | `/api/members/:id/notifications/read` | | `true` | self |
| POST | `/api/transactions/issue` | `{ userId, bookId }` | transaction | librarian |
| POST | `/api/transactions/:id/return` | `{ finePaid }` | transaction | librarian |
| POST | `/api/transactions/:id/renew` | | transaction | member |
| POST | `/api/reservations` | `{ bookId }` | reservation (+ `position`) | member |
| DELETE | `/api/reservations/:id` | | reservation | member |
| GET | `/api/dashboard` | | librarian dashboard numbers | librarian |
| GET | `/api/reports` | `?period=week\|month\|semester` | report | staff |
| POST | `/api/notifications/reminders` | | `{ sent }`: reminds everyone with an overdue book | librarian |
| POST | `/api/admin/reset` | | `{ reset: true }`: puts the demo data back | staff |
| GET | `/api/admin/overview` | | admin dashboard numbers | admin |
| GET | `/api/admin/users` | `?q=&role=` | user[] (+ `activeLoans`) | admin |
| POST | `/api/admin/users` | `{ id, name, role, dept, email, password }` | user | admin |
| PUT | `/api/admin/users/:id` | `{ name, role, dept, email }` | user | admin |
| POST | `/api/admin/users/:id/reset-password` | `{ password }` | `true` | admin |
| DELETE | `/api/admin/users/:id` | | `{ deleted }` (blocked if books issued or fines unpaid) | admin |

**Login rule:** `/api/auth/login` with `role: "admin"` only accepts admin accounts, and admin accounts can only sign in with `role: "admin"` (from `admin-login.html`).


**Member stats** fields: `issuedCount, overdueCount, unpaidFine, accruingFine, totalDue, limit, loanDays, totalBorrowed`.

**Transaction responses** also include `book {id,title,author,color,category,shelf}`, `user {id,name,role}`, live `fine`, `daysLeft` and `overdue`.

To see the exact shape of any response, open the app, press F12 → Console, and run for example:
```js
OS.api.memberSummary('24BCS001').then(console.log)
```

## Test cases worth writing (for the testing teammate)

1. Login with the wrong password, or the wrong role for a valid ID → error message
2. Issue a 5th book to a student → blocked (limit 4)
3. Issue to a member with an overdue book → blocked
4. Return a book 3 days late → fine ₹15
5. Reserve a book with 0 copies → queue position 1; a second user → position 2
6. Return that book → first user becomes "ready", the book stays at 0 available
7. Renew an overdue book → blocked; renew twice → blocked
8. Delete a book while a copy is issued → blocked
9. Student opens `members.html` directly → redirected to the dashboard
10. Call a librarian endpoint with no token → 401; with a student's token → 403
11. Student asks for another member's `/summary` → 403
12. Two librarians issue the last copy of a book at the same moment → exactly one succeeds
