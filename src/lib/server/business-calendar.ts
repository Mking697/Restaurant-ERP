// GAP-008 (P0 decision, October 31, 2026): the owner confirmed Tanzania
// local time (EAT, fixed UTC+3, no DST ever observed) and TSh are the
// single source of truth for every business-day/shift-window/report-period
// boundary going forward, with a FULL replacement of the previously
// India-coded Asia/Kolkata (IST, UTC+5:30) calendar semantics scattered
// across src/lib/server/shifts.ts, src/lib/server/workforce-calculation.ts
// and src/app/api/reports/_aggregation.ts — not just a display-layer rename.
//
// This is the ONE canonical definition; every other file now delegates to
// it rather than keeping its own copy of the timezone/offset. Historical
// data already computed under the old IST semantics (closed shifts, posted
// payroll, past reports) is NOT retroactively recalculated — only NEW "now"
// boundaries computed from this point forward use Tanzania time. Several
// call sites keep their old "ist"-prefixed exported names (currentIstTime,
// businessDate, istDayRange/istMonthRange/istDayKey/istDayLabel) as thin
// wrappers around these functions, to avoid a simultaneous rename across
// every caller in this same pass — the BEHAVIOR is now Tanzania EAT
// everywhere; the cosmetic rename of those remaining call sites is a
// separate, lower-risk follow-up (same "harmless legacy identifier name
// vs. wrong behavior" distinction this GAP's acceptance criteria draws).
export const BUSINESS_TIMEZONE = "Africa/Dar_es_Salaam";
const BUSINESS_OFFSET_MS = 3 * 60 * 60 * 1000; // EAT: fixed UTC+3, Tanzania never observes DST
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parsedCalendarDate(value: string) {
  if (!CALENDAR_DATE.test(value)) throw new Error("Report date must be a valid YYYY-MM-DD calendar date");
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) throw new Error("Report date must be a valid YYYY-MM-DD calendar date");
  return { y, m, d };
}

export function businessDateParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d };
}

// "YYYY-MM-DD" business calendar date for the given instant, Tanzania EAT.
export function businessDateString(now: Date = new Date()): string {
  const { y, m, d } = businessDateParts(now);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// "HH:MM" wall-clock time for the given instant, Tanzania EAT — used by
// shift-window matching (which window currently covers "now").
export function businessTimeHHMM(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  return `${parts.find((p) => p.type === "hour")!.value}:${parts.find((p) => p.type === "minute")!.value}`;
}

// [start, end) UTC instants spanning the Tanzania EAT calendar day containing `now`.
export function businessDayRange(now: Date = new Date()) {
  const { y, m, d } = businessDateParts(now);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - BUSINESS_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function businessDateRange(date: string) {
  const { y, m, d } = parsedCalendarDate(date);
  const start = new Date(Date.UTC(y, m - 1, d) - BUSINESS_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function previousBusinessDate(now: Date = new Date()): string {
  const { start } = businessDayRange(now);
  return businessDateString(new Date(start.getTime() - 1));
}

export function validateReportDate(date: string, now: Date = new Date()): string {
  parsedCalendarDate(date);
  if (date > businessDateString(now)) throw new Error("Cannot generate an end-of-day report for a future date");
  return date;
}

// [start, end) UTC instants spanning the Tanzania EAT calendar month containing `now`.
export function businessMonthRange(now: Date = new Date()) {
  const { y, m } = businessDateParts(now);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - BUSINESS_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0) - BUSINESS_OFFSET_MS);
  return { start, end };
}

// "YYYY-MM-DD" business-day key for an arbitrary already-recorded instant
// (e.g. labeling a historical row by the Tanzania EAT day it falls in).
export function businessDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Short human label (e.g. "05 Nov") for chart axes, Tanzania EAT.
export function businessDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIMEZONE, day: "2-digit", month: "short" }).format(date);
}
