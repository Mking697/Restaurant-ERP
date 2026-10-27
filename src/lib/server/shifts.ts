import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { branchShifts, shiftHandovers, shiftRuns } from "../../db/schema/shifts";
import { cashDrops, posOrders } from "../../db/schema/pos";
import type { Executor } from "./auth";
import { HttpError, type Identity } from "./permissions";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface ShiftDefinitionInput { label: string; startTime: string; endTime: string }

function minutesOf(hhmm: string) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
// A shift's own duration, with overnight wrap: end === start means "goes all
// the way around" (only sensible for a single 24h shift), end > start is the
// normal same-day case, end < start crosses midnight.
function durationMinutes(startTime: string, endTime: string) {
  if (startTime === endTime) return 1440;
  const start = minutesOf(startTime), end = minutesOf(endTime);
  return end > start ? end - start : 1440 - start + end;
}

// Every branch's shifts must tile a full 24h day with zero gaps and zero
// overlaps, in the given cycle order — shift[i]'s end must be shift[i+1]'s
// start (wrapping back to shift[0] after the last one). At least one shift
// is required; a lone shift must cover the full 24h on its own.
export function validateShiftDefinitions(list: ShiftDefinitionInput[]): ShiftDefinitionInput[] {
  if (!Array.isArray(list) || !list.length || list.length > 12) throw new HttpError(400, "1-12 shifts required");
  const cleaned = list.map((row) => {
    if (!row || typeof row !== "object") throw new HttpError(400, "Invalid shift");
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const startTime = typeof row.startTime === "string" ? row.startTime : "";
    const endTime = typeof row.endTime === "string" ? row.endTime : "";
    if (!label || label.length > 40) throw new HttpError(400, "Shift label required (max 40 chars)");
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw new HttpError(400, `Invalid time for shift "${label}" — use 24h HH:MM`);
    return { label, startTime, endTime };
  });
  const totalMinutes = cleaned.reduce((sum, s) => sum + durationMinutes(s.startTime, s.endTime), 0);
  if (totalMinutes !== 1440) throw new HttpError(400, `Shifts must cover exactly 24 hours with no gaps or overlaps (currently ${(totalMinutes / 60).toFixed(2)}h)`);
  for (let i = 0; i < cleaned.length; i++) {
    const next = cleaned[(i + 1) % cleaned.length];
    if (cleaned[i].endTime !== next.startTime) throw new HttpError(400, `"${cleaned[i].label}" must end exactly when "${next.label}" starts — no gap or overlap allowed`);
  }
  return cleaned;
}

// IST "HH:MM" for the current instant — shift windows are wall-clock, not
// UTC, same business-day convention as src/lib/server/workforce-calculation.ts.
export function currentIstTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  return `${parts.find((p) => p.type === "hour")!.value}:${parts.find((p) => p.type === "minute")!.value}`;
}

function isWithin(nowHHMM: string, startTime: string, endTime: string) {
  if (startTime === endTime) return true; // single 24h shift
  const now = minutesOf(nowHHMM), start = minutesOf(startTime), end = minutesOf(endTime);
  return end > start ? now >= start && now < end : now >= start || now < end;
}

// All shift mutations for a branch (configure/start/end/accept) share one
// lock, same convention as lockRecipeStock — no stale-read race between a
// config edit, a start, and an end for the same branch.
export async function lockShiftState(tx: Executor, branchId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"shift-state:" + branchId}))`);
}

export async function activeDefinitions(tx: Executor, branchId: string) {
  return tx.select().from(branchShifts).where(and(eq(branchShifts.branchId, branchId), eq(branchShifts.isActive, true))).orderBy(branchShifts.sortOrder);
}

export async function currentOpenRun(tx: Executor, branchId: string) {
  const [run] = await tx.select().from(shiftRuns).where(and(eq(shiftRuns.branchId, branchId), eq(shiftRuns.status, "OPEN"))).orderBy(desc(shiftRuns.startedAt)).limit(1);
  return run ?? null;
}

async function pendingHandoverFor(tx: Executor, runId: string) {
  const [row] = await tx.select().from(shiftHandovers).where(and(eq(shiftHandovers.toRunId, runId), eq(shiftHandovers.status, "PENDING"))).limit(1);
  return row ?? null;
}

// Called by POS order creation and the End Shift flow. Returns "" for
// shiftRunId when the branch hasn't opted into shift management at all
// (zero branch_shifts configured) — purely additive, never blocks a branch
// that hasn't set this up. Once configured, an open+accepted run is
// required, or the action is rejected with a clear 409.
export async function requireOperableShift(tx: Executor, branchId: string): Promise<{ shiftRunId: string; gated: false } > {
  // Keep this contract safe for transaction callers too, not only mutate()
  // (which currently also serializes HTTP mutations with a global lock).
  // POS takes recipe-stock then shift-state; never acquire recipe-stock from
  // an end/config path while holding shift-state (that would invert the order).
  await lockShiftState(tx, branchId);
  const defs = await activeDefinitions(tx, branchId);
  if (!defs.length) return { shiftRunId: "", gated: false };
  const run = await currentOpenRun(tx, branchId);
  if (!run) throw new HttpError(409, "No active shift for this branch — ask a Branch Admin/Cashier to start one on the Shifts page first.");
  const pending = await pendingHandoverFor(tx, run.id);
  if (pending) throw new HttpError(409, "Previous shift's handover is still pending — accept it before continuing.");
  return { shiftRunId: run.id, gated: false };
}

export async function startFirstShift(tx: Executor, actor: Identity, branchId: string) {
  await lockShiftState(tx, branchId);
  const defs = await activeDefinitions(tx, branchId);
  if (!defs.length) throw new HttpError(400, "Configure at least one shift for this branch first");
  const existing = await currentOpenRun(tx, branchId);
  if (existing) throw new HttpError(409, "A shift is already open for this branch");
  const now = currentIstTime();
  const due = defs.find((d) => isWithin(now, d.startTime, d.endTime)) ?? defs[0];
  const [run] = await tx.insert(shiftRuns).values({ id: randomUUID(), branchId, shiftDefinitionId: due.id, label: due.label, status: "OPEN", startedBy: actor.id }).returning();
  return run;
}

// Ends the given OPEN run: takes the closing blind cash count, computes this
// run's own POS tender totals (never typed in by a human), creates the
// PENDING handover, and immediately opens the next shift in the cycle so
// there is never a gap. Returns the handover + the new run.
export async function endShiftAndHandover(tx: Executor, actor: Identity, branchId: string, runId: string, denominations: { note500Count: number; note200Count: number; note100Count: number; note50Count: number; note20Count: number; note10Count: number; coinsInr: number }) {
  await lockShiftState(tx, branchId);
  const [run] = await tx.select().from(shiftRuns).where(and(eq(shiftRuns.id, runId), eq(shiftRuns.branchId, branchId), eq(shiftRuns.status, "OPEN"))).limit(1);
  if (!run) throw new HttpError(404, "Open shift run not found");
  const pending = await pendingHandoverFor(tx, run.id);
  if (pending) throw new HttpError(409, "Accept this shift's own handover before ending it");

  const defs = await activeDefinitions(tx, branchId);
  if (!defs.length) throw new HttpError(409, "No active shift windows configured for this branch");
  const currentIndex = defs.findIndex((d) => d.id === run.shiftDefinitionId);
  // Unchanged definitions follow the configured cycle, even for early/late
  // manual closes. If configuration was replaced mid-run, its old identity
  // no longer defines that cycle: enter the new window due at closing time.
  const next = currentIndex >= 0 ? defs[(currentIndex + 1) % defs.length] : defs.find((d) => isWithin(currentIstTime(), d.startTime, d.endTime));
  if (!next) throw new HttpError(409, "No shift window covers the current time");

  const tenders = await tx.select({ tenderType: posOrders.tenderType, totalAmount: posOrders.totalAmount }).from(posOrders).where(and(eq(posOrders.shiftRunId, run.id), eq(posOrders.branchId, branchId), eq(posOrders.status, "COMPLETED")));
  // Physical cash is carried forward at its accepted COUNTED value, including
  // any prior shortage/excess. Electronic tenders are receipts for this run
  // only, not a drawer balance: never add incoming CARD/UPI/OTHER again.
  const [incoming] = await tx.select().from(shiftHandovers).where(and(eq(shiftHandovers.toRunId, run.id), eq(shiftHandovers.branchId, branchId), eq(shiftHandovers.status, "ACCEPTED"))).limit(1);
  let cashExpected = Number(incoming?.cashAmount ?? 0), cardAmount = 0, upiAmount = 0, otherAmount = 0;
  for (const row of tenders) {
    const amount = Number(row.totalAmount);
    if (row.tenderType === "CASH") cashExpected += amount;
    else if (row.tenderType === "CARD") cardAmount += amount;
    else if (row.tenderType === "UPI") upiAmount += amount;
    else otherAmount += amount;
  }

  const countedCashInr = 500 * denominations.note500Count + 200 * denominations.note200Count + 100 * denominations.note100Count + 50 * denominations.note50Count + 20 * denominations.note20Count + 10 * denominations.note10Count + denominations.coinsInr;
  const closingDropId = randomUUID();
  await tx.insert(cashDrops).values({
    id: closingDropId, branchId, cashierId: actor.id, shiftDate: run.startedAt,
    expectedCashInr: cashExpected.toFixed(2),
    note500Count: denominations.note500Count, note200Count: denominations.note200Count, note100Count: denominations.note100Count,
    note50Count: denominations.note50Count, note20Count: denominations.note20Count, note10Count: denominations.note10Count,
    coinsInr: denominations.coinsInr.toFixed(2), countedCashInr: countedCashInr.toFixed(2),
    shortageExcessInr: (countedCashInr - cashExpected).toFixed(2), shiftRunId: run.id,
  });

  const [endedRun] = await tx.update(shiftRuns).set({ status: "ENDED", endedAt: new Date(), endedBy: actor.id }).where(eq(shiftRuns.id, run.id)).returning();

  const [nextRun] = await tx.insert(shiftRuns).values({ id: randomUUID(), branchId, shiftDefinitionId: next.id, label: next.label, status: "OPEN", startedBy: actor.id }).returning();

  const [handover] = await tx.insert(shiftHandovers).values({
    id: randomUUID(), branchId, fromRunId: run.id, toRunId: nextRun.id, closingCashDropId: closingDropId,
    cashAmount: countedCashInr.toFixed(2), cardAmount: cardAmount.toFixed(2), upiAmount: upiAmount.toFixed(2), otherAmount: otherAmount.toFixed(2),
  }).returning();

  return { handover, fromRun: endedRun, toRun: nextRun, cashExpected: cashExpected.toFixed(2), shortageExcessInr: (countedCashInr - cashExpected).toFixed(2) };
}

export async function acceptHandover(tx: Executor, actor: Identity, branchId: string, handoverId: string) {
  await lockShiftState(tx, branchId);
  const [handover] = await tx.select().from(shiftHandovers).where(and(eq(shiftHandovers.id, handoverId), eq(shiftHandovers.branchId, branchId), eq(shiftHandovers.status, "PENDING"))).limit(1);
  if (!handover) throw new HttpError(404, "Pending handover not found");
  const [updated] = await tx.update(shiftHandovers).set({ status: "ACCEPTED", acceptedBy: actor.id, acceptedAt: new Date() }).where(eq(shiftHandovers.id, handoverId)).returning();
  return updated;
}
