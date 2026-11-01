// Dates travel as 'YYYY-MM-DD' strings. "Today" is the library's local date,
// not the server's (Vercel runs in UTC), so a book due today isn't late at 5:30am.
const DAY = 24 * 60 * 60 * 1000;
const TZ = process.env.LIBRARY_TZ || 'Asia/Kolkata';
let fixedToday = null;

export function todayISO() {
  if (fixedToday) return fixedToday;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
// Tests only: pin "today" to a date.
export function setToday(iso) { fixedToday = iso; }

export const toTime = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const addDays = (iso, n) => new Date(toTime(iso) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toTime(b) - toTime(a)) / DAY);
export const monthOf = (iso) => new Date(toTime(iso)).getUTCMonth();

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(toTime(iso)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
