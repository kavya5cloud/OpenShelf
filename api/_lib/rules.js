// Library rules. Keep these in step with OS.RULES in js/store.js, which the
// frontend uses to label buttons and show fine rates.
export const RULES = {
  student: { maxBooks: 4, loanDays: 14 },
  faculty: { maxBooks: 10, loanDays: 30 },
  finePerDay: 5,   // ₹ per late day
  holdDays: 2,     // days a "ready" reservation is kept for pickup
  maxRenewals: 1
};
