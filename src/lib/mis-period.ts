// UI calendar controls select inclusive Tanzania EAT dates; APIs receive [start, end).
// Pure client/server helper: no environment, database or browser dependencies.
// GAP-008 (October 31, 2026): Tanzania EAT is fixed UTC+3 (no DST) — was
// previously India-coded IST (+05:30); full behavior replacement, not just
// a display rename.
export function misCalendarWindow(from: string, to: string) {
  function calendar(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Invalid MIS calendar date");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RangeError("Invalid MIS calendar date");
    return date;
  }
  const first = calendar(from), last = calendar(to);
  const days = (last.getTime() - first.getTime()) / 86400000 + 1;
  if (days < 1 || days > 31) throw new RangeError("Select 1–31 inclusive Tanzania EAT days");
  last.setUTCDate(last.getUTCDate() + 1);
  return { periodStart: new Date(`${from}T00:00:00+03:00`).toISOString(), periodEnd: new Date(`${last.toISOString().slice(0, 10)}T00:00:00+03:00`).toISOString() };
}
export function istCalendarDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
