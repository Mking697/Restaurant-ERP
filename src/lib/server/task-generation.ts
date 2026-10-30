import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { branches } from "@/db/schema/platform";
import { holidayCalendar, recurringTaskDefinitions, taskInstances } from "@/db/schema/tasks";
import type { Executor } from "./auth";

// ---------------------------------------------------------------------------
// AUTOMATION-1a — recurring occurrence generation + 30-minute overdue
// escalation. Everything below `planGeneration`/`shouldEscalate` and above is
// a PURE function (no DB, no Date.now()) so the scheduling-day decision,
// missed-day carry-forward and escalation boundary are fully unit-testable.
// Only `generateRecurringOccurrences`/`escalateOverdueInstances` touch the
// database, and they are thin wrappers around the pure core. See
// docs/automation-1a-contract.md for the exact spec this implements.
// ---------------------------------------------------------------------------

export type Frequency =
  | "DAILY"
  | "WEEKLY"
  | "FORTNIGHTLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "HALF_YEARLY"
  | "YEARLY";

const INTERVAL_DAYS: Partial<Record<Frequency, number>> = { DAILY: 1, WEEKLY: 7, FORTNIGHTLY: 15 };
const INTERVAL_MONTHS: Partial<Record<Frequency, number>> = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 };
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // India is a fixed UTC+5:30 offset, no DST.

// IST calendar date (YYYY-MM-DD) for a UTC instant.
export function istDateOnly(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDateStr(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}
function dateStrFromUTC(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based; day 0 of next month = last day of this month
}
function addDaysToDateStr(dateStr: string, days: number): string {
  const { y, m, d } = parseDateStr(dateStr);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}
// Advances by `months` calendar months, clamping the day-of-month to the
// target month's own length (31st anchor -> 28th/29th in February) without
// ever carrying the clamped shortfall into a later cycle.
function addMonthsClamped(dateStr: string, months: number): string {
  const { y, m, d } = parseDateStr(dateStr);
  const totalMonths = (m - 1) + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12 + 1;
  const targetDay = Math.min(d, daysInMonth(targetYear, targetMonth));
  return dateStrFromUTC(targetYear, targetMonth, targetDay);
}
function dateDiffDays(laterStr: string, earlierStr: string): number {
  const later = parseDateStr(laterStr);
  const earlier = parseDateStr(earlierStr);
  const laterMs = Date.UTC(later.y, later.m - 1, later.d);
  const earlierMs = Date.UTC(earlier.y, earlier.m - 1, earlier.d);
  return Math.round((laterMs - earlierMs) / (24 * 60 * 60 * 1000));
}

// cycleStartDateStr(anchor, frequency, i) is monotonically increasing in `i`
// for every supported frequency — the idempotency keys below rely on that.
export function cycleStartDateStr(anchorDateStr: string, frequency: Frequency, index: number): string {
  if (index < 0) throw new Error("cycle index must be >= 0");
  const days = INTERVAL_DAYS[frequency];
  if (days !== undefined) return addDaysToDateStr(anchorDateStr, days * index);
  const months = INTERVAL_MONTHS[frequency];
  if (months !== undefined) return addMonthsClamped(anchorDateStr, months * index);
  throw new Error(`Unknown frequency: ${frequency}`);
}

// Largest cycle index whose start date is <= todayStr, or null if todayStr is
// before the anchor date (the definition has not started yet).
export function latestCycleIndex(anchorDateStr: string, frequency: Frequency, todayStr: string): number | null {
  if (todayStr < anchorDateStr) return null;
  const days = INTERVAL_DAYS[frequency];
  if (days !== undefined) return Math.floor(dateDiffDays(todayStr, anchorDateStr) / days);
  // Month-based: estimate via calendar month difference, then correct for
  // day-of-month clamping by nudging the index until the bracket is exact.
  const anchor = parseDateStr(anchorDateStr);
  const today = parseDateStr(todayStr);
  const monthDiff = (today.y - anchor.y) * 12 + (today.m - anchor.m);
  const months = INTERVAL_MONTHS[frequency]!;
  let idx = Math.max(0, Math.floor(monthDiff / months));
  while (cycleStartDateStr(anchorDateStr, frequency, idx + 1) <= todayStr) idx++;
  while (idx > 0 && cycleStartDateStr(anchorDateStr, frequency, idx) > todayStr) idx--;
  return cycleStartDateStr(anchorDateStr, frequency, idx) <= todayStr ? idx : null;
}

export function isScheduledDay(anchorDateStr: string, frequency: Frequency, todayStr: string): boolean {
  const idx = latestCycleIndex(anchorDateStr, frequency, todayStr);
  return idx !== null && cycleStartDateStr(anchorDateStr, frequency, idx) === todayStr;
}

// Every not-yet-generated cycle index up to and including today's, bounded by
// maxCatchUp so a long-outage cron run stays O(bounded) rather than
// backfilling unlimited history. lastGeneratedIndex === null means "never
// generated before" -> only the current cycle, not full history since anchor.
export function pendingCycleIndexes(
  anchorDateStr: string,
  frequency: Frequency,
  todayStr: string,
  lastGeneratedIndex: number | null,
  maxCatchUp = 60
): number[] {
  const latest = latestCycleIndex(anchorDateStr, frequency, todayStr);
  if (latest === null) return [];
  let from = lastGeneratedIndex === null ? latest : lastGeneratedIndex + 1;
  if (from > latest) return [];
  if (latest - from + 1 > maxCatchUp) from = latest - maxCatchUp + 1;
  const result: number[] = [];
  for (let i = from; i <= latest; i++) result.push(i);
  return result;
}

// A generated naturalCycleStartDate is, by construction, itself a cycle start
// date for its definition — this just inverts cycleStartDateStr for it.
function indexForGeneratedDate(anchorDateStr: string, frequency: Frequency, dateStr: string): number {
  const idx = latestCycleIndex(anchorDateStr, frequency, dateStr);
  if (idx === null) throw new Error("naturalCycleStartDate is before the anchor date");
  return idx;
}

// IST wall-clock `shiftTime` ("HH:MM") on an IST calendar date -> UTC instant.
export function dueAtForCycle(cycleDateStr: string, shiftTime: string): Date {
  const [hh, mm] = shiftTime.split(":").map(Number);
  const { y, m, d } = parseDateStr(cycleDateStr);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MS);
}

export interface DefinitionInput {
  id: string;
  branchId: string | null;
  title: string;
  description: string;
  assignedToId: string;
  assignedById: string;
  frequency: Frequency;
  assignDate: Date;
  shiftTime: string;
}
export interface GenerationPlan {
  branchId: string;
  naturalCycleStartDate: string;
  dueAt: Date;
}

// Pure generation planner: no DB access. `activeBranchIds` is the full list
// to target for a global (branchId null) definition; a branch-scoped
// definition only ever targets its own branch regardless of that list.
// `holidayDatesByBranch`/`lastGeneratedDateByBranch` are plain-object lookups
// the DB wrapper below populates from real queries.
export function planGeneration(
  definition: DefinitionInput,
  now: Date,
  activeBranchIds: string[],
  holidayDatesByBranch: Record<string, Set<string>>,
  lastGeneratedDateByBranch: Record<string, string | null>,
  maxCatchUp = 60
): GenerationPlan[] {
  const anchorDateStr = istDateOnly(definition.assignDate);
  const todayStr = istDateOnly(now);
  const targets = definition.branchId ? [definition.branchId] : activeBranchIds;
  const plans: GenerationPlan[] = [];
  for (const branchId of targets) {
    const lastDate = lastGeneratedDateByBranch[branchId] ?? null;
    const lastIndex = lastDate === null ? null : indexForGeneratedDate(anchorDateStr, definition.frequency, lastDate);
    const pending = pendingCycleIndexes(anchorDateStr, definition.frequency, todayStr, lastIndex, maxCatchUp);
    const holidays = holidayDatesByBranch[branchId] ?? new Set<string>();
    for (const idx of pending) {
      const dateStr = cycleStartDateStr(anchorDateStr, definition.frequency, idx);
      if (holidays.has(dateStr)) continue; // deliberate business skip, not a missed run to carry forward
      plans.push({ branchId, naturalCycleStartDate: dateStr, dueAt: dueAtForCycle(dateStr, definition.shiftTime) });
    }
  }
  return plans;
}

export interface EscalationCandidate {
  status: string;
  overdueEscalatedAt: Date | null;
  dueAt: Date;
}
const ESCALATION_THRESHOLD_MS = 30 * 60 * 1000;
export function shouldEscalate(row: EscalationCandidate, now: Date): boolean {
  if (row.overdueEscalatedAt !== null) return false;
  if (row.status !== "PENDING" && row.status !== "IN_PROGRESS") return false;
  return now.getTime() - row.dueAt.getTime() > ESCALATION_THRESHOLD_MS;
}

// ---------------------------------------------------------------------------
// DB wrappers — thin; all scheduling logic above is pure and already tested.
// ---------------------------------------------------------------------------

export async function generateRecurringOccurrences(tx: Executor, now: Date = new Date()): Promise<number> {
  const defs = await tx.select().from(recurringTaskDefinitions).where(eq(recurringTaskDefinitions.status, "Active"));
  if (!defs.length) return 0;
  const activeBranchIds = (await tx.select({ id: branches.id }).from(branches)).map((b) => b.id);
  const holidayRows = await tx.select().from(holidayCalendar);
  const holidayDatesByBranch: Record<string, Set<string>> = {};
  for (const row of holidayRows) {
    (holidayDatesByBranch[row.branchId] ??= new Set<string>()).add(row.date as unknown as string);
  }

  let generated = 0;
  for (const def of defs as unknown as DefinitionInput[]) {
    const targets = def.branchId ? [def.branchId] : activeBranchIds;
    if (!targets.length) continue;
    const existing = await tx
      .select({ branchId: taskInstances.branchId, cycleDate: taskInstances.naturalCycleStartDate })
      .from(taskInstances)
      .where(and(eq(taskInstances.recurringDefinitionId, def.id), inArray(taskInstances.branchId, targets)));
    const lastGeneratedDateByBranch: Record<string, string | null> = {};
    for (const branchId of targets) lastGeneratedDateByBranch[branchId] = null;
    for (const row of existing) {
      if (!row.cycleDate) continue;
      const current = lastGeneratedDateByBranch[row.branchId];
      if (current === null || row.cycleDate > current) lastGeneratedDateByBranch[row.branchId] = row.cycleDate;
    }
    const plans = planGeneration(def, now, targets, holidayDatesByBranch, lastGeneratedDateByBranch);
    for (const plan of plans) {
      try {
        await tx.insert(taskInstances).values({
          id: randomUUID(),
          recurringDefinitionId: def.id,
          branchId: plan.branchId,
          type: "RECURRING",
          title: def.title,
          description: def.description,
          assignedToId: def.assignedToId,
          delegatedById: null,
          priority: null,
          voiceNoteUrl: "",
          dueAt: plan.dueAt,
          status: "PENDING",
          naturalCycleStartDate: plan.naturalCycleStartDate,
        });
        generated++;
      } catch (error) {
        // Unique-violation-is-a-no-op: another concurrent invocation (or a
        // retried same-tick call) already generated this exact occurrence.
        if ((error as { code?: string; cause?: { code?: string } })?.code !== "23505" &&
            (error as { cause?: { code?: string } })?.cause?.code !== "23505") throw error;
      }
    }
  }
  return generated;
}

// AUTOMATION-1b — each returned row is exactly one occurrence that JUST
// flipped PENDING/IN_PROGRESS -> OVERDUE on THIS call (the WHERE isNull(
// overdueEscalatedAt) guard is the one-shot trigger). The caller sends
// exactly one escalation notice per returned row and never re-fetches this
// set — an occurrence already escalated on a prior tick is excluded by
// construction, so retries/duplicate ticks can never double-notify.
export interface EscalatedInstance {
  id: string;
  branchId: string;
  assignedToId: string;
  title: string;
  dueAt: Date;
}
export async function escalateOverdueInstances(tx: Executor, now: Date = new Date()): Promise<EscalatedInstance[]> {
  const threshold = new Date(now.getTime() - ESCALATION_THRESHOLD_MS);
  const rows = await tx
    .update(taskInstances)
    .set({ status: "OVERDUE", overdueEscalatedAt: now })
    .where(
      and(
        inArray(taskInstances.status, ["PENDING", "IN_PROGRESS"]),
        lt(taskInstances.dueAt, threshold),
        isNull(taskInstances.overdueEscalatedAt)
      )
    )
    .returning({
      id: taskInstances.id,
      branchId: taskInstances.branchId,
      assignedToId: taskInstances.assignedToId,
      title: taskInstances.title,
      dueAt: taskInstances.dueAt,
    });
  return rows;
}

// AUTOMATION-1b — "first becomes due" reminder trigger. Unlike escalation,
// becoming due is not itself a status transition (status stays PENDING/
// IN_PROGRESS), so there is no existing state flip to piggyback on — this
// adds its own one-shot flag (reminderSentAt) guarded the same way: the
// UPDATE's WHERE isNull(reminderSentAt) makes claiming atomic, and only rows
// this exact call actually claimed (RETURNING) are returned, so a retried or
// overlapping tick can never claim (and therefore never notify for) the same
// occurrence twice.
export interface DueReminderInstance {
  id: string;
  branchId: string;
  assignedToId: string;
  title: string;
  dueAt: Date;
}
export async function claimDueTaskReminders(tx: Executor, now: Date = new Date()): Promise<DueReminderInstance[]> {
  const rows = await tx
    .update(taskInstances)
    .set({ reminderSentAt: now })
    .where(
      and(
        inArray(taskInstances.status, ["PENDING", "IN_PROGRESS"]),
        lt(taskInstances.dueAt, now),
        isNull(taskInstances.reminderSentAt)
      )
    )
    .returning({
      id: taskInstances.id,
      branchId: taskInstances.branchId,
      assignedToId: taskInstances.assignedToId,
      title: taskInstances.title,
      dueAt: taskInstances.dueAt,
    });
  return rows;
}
