// Database schema. Safe to run more than once.
// Transactions and reservations keep book_id without a foreign key on purpose:
// a deleted book's loan history stays, shown as "(deleted book)".
export const SCHEMA = `
create table if not exists users (
  id            text primary key,
  password_hash text not null,
  role          text not null check (role in ('librarian', 'student', 'faculty')),
  name          text not null,
  dept          text not null default '',
  email         text not null default ''
);

create table if not exists books (
  id         text primary key,
  isbn       text not null default '',
  title      text not null,
  author     text not null,
  category   text not null,
  total      int  not null check (total >= 1),
  available  int  not null check (available >= 0),
  shelf      text not null default '—',
  color      text not null,
  year       int,
  added_on   date not null,
  check (available <= total)
);

create table if not exists transactions (
  id          text primary key,
  book_id     text not null,
  user_id     text not null references users(id) on delete cascade,
  issue_date  date not null,
  due_date    date not null,
  return_date date,
  renewals    int  not null default 0,
  fine        int  not null default 0,
  fine_paid   boolean not null default true
);
create index if not exists transactions_user_idx on transactions (user_id);
create index if not exists transactions_book_idx on transactions (book_id);
create index if not exists transactions_open_idx on transactions (due_date) where return_date is null;

create table if not exists reservations (
  id         text primary key,
  book_id    text not null,
  user_id    text not null references users(id) on delete cascade,
  date       date not null,
  status     text not null check (status in ('waiting', 'ready', 'fulfilled', 'cancelled', 'expired')),
  hold_until date,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists reservations_book_idx on reservations (book_id, status);
create index if not exists reservations_user_idx on reservations (user_id);

create table if not exists notifications (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  date       date not null,
  type       text not null check (type in ('info', 'success', 'warn')),
  text       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create sequence if not exists bk_seq;
create sequence if not exists tx_seq;
create sequence if not exists rs_seq;
create sequence if not exists nt_seq;
`;

export const DROP = `
drop table if exists notifications, reservations, transactions, books, users cascade;
drop sequence if exists bk_seq, tx_seq, rs_seq, nt_seq;
`;
