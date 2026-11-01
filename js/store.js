/* OpenShelf — library rules and date helpers
   ---------------------------------------------------------------
   The data itself lives in the database behind the API (see api/ and API.md).
   This file only holds the rules the pages show to people, and small date
   helpers. If you change a rule, change it in api/_lib/rules.js too — the
   server is what actually enforces it.
*/
window.OS = window.OS || {};

(function (OS) {
  const DAY = 24 * 60 * 60 * 1000;

  // Library rules — keep in step with api/_lib/rules.js.
  OS.RULES = {
    student: { maxBooks: 4, loanDays: 14 },
    faculty: { maxBooks: 10, loanDays: 30 },
    finePerDay: 5,        // ₹ per late day
    holdDays: 2,          // days a "ready" reservation is kept for pickup
    maxRenewals: 1
  };

  // ---------- date helpers ----------
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  OS.today = () => startOfDay(new Date());
  OS.addDays = (d, n) => new Date(startOfDay(d).getTime() + n * DAY);
  OS.toISO = (d) => {
    const x = startOfDay(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  };
  OS.parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  OS.daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
})(window.OS);
