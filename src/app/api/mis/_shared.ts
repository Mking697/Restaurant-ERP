import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { istCalendarDay } from "@/lib/mis-period";
import { branches } from "@/db/schema/platform";
import { taskInstances } from "@/db/schema/tasks";
import { nightVarianceEntries } from "@/db/schema/inventory";
import { shiftRuns, shiftHandovers } from "@/db/schema/shifts";
import { cashDrops } from "@/db/schema/pos";
import { misScores } from "@/db/schema/mis";
import type { Executor } from "@/lib/server/auth";
import { HttpError, branchScope, assertModule, type Identity } from "@/lib/server/permissions";
import { allowedFields } from "@/lib/server/tasks";

// ---------------------------------------------------------------------------
// MIS Scoring Engine — 100-point weighted branch-level score computed from
// REAL rows only (task_instances / night_variance_entries / shift_runs +
// cash_drops). Never fabricates a component with no underlying data: a
// component with zero real rows in the period is `null` and excluded from
// both the weighted total AND its own re-normalized weight share (contract's
// "never fabricate a number, return null+reason instead" convention). This
// module owns the math only — routes under src/app/api/mis/** own auth/HTTP.
// ---------------------------------------------------------------------------

export const MIS_WEIGHTS = { taskScore: 40, delegationScore: 30, varianceScore: 20, cashierScore: 10 } as const;
export type MisComponentKey = keyof typeof MIS_WEIGHTS;
export const MIS_COMPONENT_ORDER: MisComponentKey[] = ["taskScore", "delegationScore", "varianceScore", "cashierScore"];

// POST /api/mis/compute is restricted to the two HQ-level roles by the
// contract's own words ("Owner/CENTRAL_STORE_MGR only") — a dedicated role
// check, not assertModule, because both roles are HQ-wide (branchId is null
// for both per src/db/schema/auth.ts) and branchScope() only special-cases
// SUPER_ADMIN, which would otherwise wrongly 403 a CENTRAL_STORE_MGR actor
// trying to compute "all branches" (branchId omitted). Not a fix to
// branchScope() itself — that is a shared function outside this module's lane.
export function assertCanComputeMis(actor: Identity) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "CENTRAL_STORE_MGR") throw new HttpError(403, "Owner or Central Store Manager access required");
}

function isoDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw new HttpError(400, `Invalid ${field}`);
  const day = value.slice(0, 10), calendar = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(calendar.getTime()) || calendar.toISOString().slice(0,10) !== day) throw new HttpError(400, `Invalid ${field}`);
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, `Invalid ${field}`);
  return parsed;
}
function dateOnly(d: Date): string {
  return istCalendarDay(d);
}
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

export function parseComputeInput(input: Record<string, unknown>) {
  allowedFields(input, ["branchId", "periodStart", "periodEnd"]);
  const periodStart = isoDate(input.periodStart, "periodStart");
  const periodEnd = isoDate(input.periodEnd, "periodEnd");
  if (periodEnd.getTime() <= periodStart.getTime()) throw new HttpError(400, "periodEnd must be after periodStart");
  if (periodEnd.getTime() - periodStart.getTime() > MAX_WINDOW_MS) throw new HttpError(400, "Window cannot exceed 31 days");
  let branchId: string | null = null;
  if (input.branchId !== undefined && input.branchId !== null && input.branchId !== "") {
    if (typeof input.branchId !== "string") throw new HttpError(400, "Invalid branchId");
    branchId = input.branchId;
  }
  return { branchId, periodStart, periodEnd };
}

// Component classifiers read real source rows only during explicit compute.
// GET decodes persisted missingness instead of re-reading mutable sources:
// genuine zero scores remain distinguishable from unavailable components.

const TASK_NOT_DONE_STATUSES = ["PENDING", "OVERDUE", "ESCALATED"] as const;

export interface TaskClassification { score: number | null; onTime: number; delay: number; notDone: number; total: number }

// taskScore reads type=RECURRING only; delegationScore reads type=ONE_TIME
// only — two disjoint populations per the schema's own comment, so calling
// this once per type never double-counts the same task_instances row twice.
export async function classifyTasks(tx: Executor, branchId: string, type: "RECURRING" | "ONE_TIME", periodStart: Date, periodEnd: Date): Promise<TaskClassification> {
  const rows = await tx.select({ status: taskInstances.status, dueAt: taskInstances.dueAt, completedAt: taskInstances.completedAt })
    .from(taskInstances)
    .where(and(eq(taskInstances.branchId, branchId), eq(taskInstances.type, type), gte(taskInstances.dueAt, periodStart), lt(taskInstances.dueAt, periodEnd)));
  const now = new Date();
  let onTime = 0, delay = 0, notDone = 0;
  for (const row of rows) {
    if (row.status === "DONE") {
      if (!row.completedAt) continue;
      if (row.completedAt.getTime() <= row.dueAt.getTime()) onTime++; else delay++;
    } else if ((TASK_NOT_DONE_STATUSES as readonly string[]).includes(row.status) && row.dueAt.getTime() < now.getTime()) {
      notDone++;
    }
    // Rows not yet due and not DONE (still PENDING ahead of schedule), or
    // SKIPPED, fall into none of the three buckets — deliberately excluded
    // from the denominator, matching the contract's bucket definitions.
  }
  const total = onTime + delay + notDone;
  return { score: total === 0 ? null : (onTime / total) * 100, onTime, delay, notDone, total };
}

export interface VarianceClassification { score: number | null; flagged: number; total: number }

// A row is "bad" if explicitly flagged for pilferage OR its absolute
// variance exceeds 5% of the theoretical (expected) quantity — matches the
// contract's exact threshold. Null (not 0%) when zero real rows exist.
export async function classifyVariance(tx: Executor, branchId: string, periodStart: Date, periodEnd: Date): Promise<VarianceClassification> {
  const rows = await tx.select({ varianceQty: nightVarianceEntries.varianceQty, theoreticalQty: nightVarianceEntries.theoreticalQty, flaggedPilferage: nightVarianceEntries.flaggedPilferage })
    .from(nightVarianceEntries)
    .where(and(eq(nightVarianceEntries.branchId, branchId), gte(nightVarianceEntries.shiftDate, dateOnly(periodStart)), lte(nightVarianceEntries.shiftDate, dateOnly(new Date(periodEnd.getTime() - 1)))));
  if (!rows.length) return { score: null, flagged: 0, total: 0 };
  let flagged = 0;
  for (const row of rows) {
    const theoretical = Math.abs(Number(row.theoreticalQty));
    const variance = Math.abs(Number(row.varianceQty));
    const threshold = theoretical * 0.05;
    if (row.flaggedPilferage || variance > threshold) flagged++;
  }
  const raw = 100 - (flagged / rows.length) * 100;
  return { score: Math.min(100, Math.max(0, raw)), flagged, total: rows.length };
}

export interface CashierClassification { score: number | null; nonzero: number; total: number }

// Reuses the existing real closing-variance figure (cash_drops.shortage
// Excess_inr, computed in src/lib/server/shifts.ts' endShiftAndHandover) —
// does not reinvent cash-variance math. "Closed in range" = shift_runs rows
// with status=ENDED whose endedAt falls in [periodStart, periodEnd).
export async function classifyCashier(tx: Executor, branchId: string, periodStart: Date, periodEnd: Date): Promise<CashierClassification> {
  const runs = await tx.select({ id: shiftRuns.id }).from(shiftRuns)
    .where(and(eq(shiftRuns.branchId, branchId), eq(shiftRuns.status, "ENDED"), gte(shiftRuns.endedAt, periodStart), lt(shiftRuns.endedAt, periodEnd)));
  if (!runs.length) return { score: null, nonzero: 0, total: 0 };
  const runIds = runs.map((r) => r.id);
  const drops = await tx.select({ shiftRunId: cashDrops.shiftRunId, shortageExcessInr: cashDrops.shortageExcessInr })
    .from(cashDrops).innerJoin(shiftHandovers, and(eq(shiftHandovers.closingCashDropId, cashDrops.id), eq(shiftHandovers.fromRunId, cashDrops.shiftRunId), eq(shiftHandovers.branchId, cashDrops.branchId)))
    .where(and(eq(cashDrops.branchId, branchId), inArray(cashDrops.shiftRunId, runIds)));
  // Missing closing observations are not proof of a balanced drawer.
  if (new Set(drops.map(d => d.shiftRunId)).size !== runs.length || drops.length !== runs.length) return { score: null, nonzero: 0, total: 0 };
  const byRun = new Map(drops.map((d) => [d.shiftRunId, d.shortageExcessInr]));
  let nonzero = 0;
  for (const id of runIds) {
    const value = byRun.get(id);
    if (value !== undefined && Number(value) !== 0) nonzero++;
  }
  const raw = 100 - (nonzero / runs.length) * 100;
  return { score: Math.min(100, Math.max(0, raw)), nonzero, total: runs.length };
}

export interface MisComponents { taskScore: TaskClassification; delegationScore: TaskClassification; varianceScore: VarianceClassification; cashierScore: CashierClassification }

export async function computeComponents(tx: Executor, branchId: string, periodStart: Date, periodEnd: Date): Promise<MisComponents> {
  return {
    taskScore: await classifyTasks(tx, branchId, "RECURRING", periodStart, periodEnd),
    delegationScore: await classifyTasks(tx, branchId, "ONE_TIME", periodStart, periodEnd),
    varianceScore: await classifyVariance(tx, branchId, periodStart, periodEnd),
    cashierScore: await classifyCashier(tx, branchId, periodStart, periodEnd),
  };
}

// Weighted sum of ONLY the non-null components, re-normalized so the
// weights actually used sum to 100 — e.g. if only taskScore+delegationScore
// have real data this period, they are weighted 40/70 and 30/70, not
// 40/100 and 30/100, so a partial-data period is never silently reported as
// if all 4 components were measured. Returns `null` totalScore (and an
// empty componentsUsed) only when every component is null — i.e. the branch
// has zero real rows of any kind for the period — the caller decides what
// to do with a fully-unscoreable branch (skip it, don't persist a fake row).
export function weightedTotal(components: MisComponents): { totalScore: number | null; componentsUsed: MisComponentKey[] } {
  const used = MIS_COMPONENT_ORDER.filter((key) => components[key].score !== null);
  if (!used.length) return { totalScore: null, componentsUsed: [] };
  const weightSum = used.reduce((sum, key) => sum + MIS_WEIGHTS[key], 0);
  const totalScore = used.reduce((sum, key) => sum + MIS_WEIGHTS[key] * (components[key].score as number), 0) / weightSum;
  return { totalScore, componentsUsed: used };
}

// ---------------------------------------------------------------------------
// Upsert — manual select-then-update/insert inside the caller's mutate()
// transaction, NOT drizzle's onConflictDoUpdate. The schema's unique index
// is on (branchId, userId, periodStart), but userId is null for every
// branch-level row here, and a plain Postgres btree unique index treats
// distinct NULLs as NOT equal — so ON CONFLICT would never actually fire for
// two branch-level rows of the same branch+period, silently inserting a
// duplicate on every re-run. This manual check-then-write (safe because
// mutate() already holds the single global advisory lock) is what makes
// re-compute genuinely idempotent for branch-level rows.
// ---------------------------------------------------------------------------

// Existing columns are NOT NULL and schema changes are not authorized.
// -1 is an out-of-domain storage sentinel ONLY; DTOs always decode it to
// null + reason. This freezes missingness at compute time (no live re-read).
const fmt = (n: number | null) => (n === null ? "-1.00" : n.toFixed(2));
export function componentSnapshot(row: Record<MisComponentKey, string>) {
  const values = Object.fromEntries(MIS_COMPONENT_ORDER.map(key => [key, Number(row[key]) < 0 ? null : row[key]])) as Record<MisComponentKey, string | null>;
  const componentsUsed = MIS_COMPONENT_ORDER.filter(key => values[key] !== null);
  const missingReasons = Object.fromEntries(MIS_COMPONENT_ORDER.filter(key => values[key] === null).map(key => [key, "No eligible real observations for this component at compute time."]));
  return { ...values, componentsUsed, missingReasons };
}

export type BranchComputeResult = { branchId: string; branchName: string; computed: boolean; reason?: string; componentsUsed?: MisComponentKey[]; score?: Record<string, unknown> };

export async function computeAndUpsertBranch(tx: Executor, branchId: string, branchName: string, periodStart: Date, periodEnd: Date): Promise<BranchComputeResult> {
  const components = await computeComponents(tx, branchId, periodStart, periodEnd);
  const { totalScore, componentsUsed } = weightedTotal(components);
  if (totalScore === null) {
    await tx.delete(misScores).where(and(eq(misScores.branchId, branchId), isNull(misScores.userId), eq(misScores.periodStart, periodStart)));
    return { branchId, branchName, computed: false, reason: "No real task, delegation, variance or cashier-shift data exists for this branch in the given period — nothing to score." };
  }
  const values = {
    branchId, userId: null as string | null, periodStart, periodEnd,
    taskScore: fmt(components.taskScore.score), delegationScore: fmt(components.delegationScore.score),
    varianceScore: fmt(components.varianceScore.score), cashierScore: fmt(components.cashierScore.score),
    totalScore: totalScore.toFixed(2),
    onTimeCount: components.taskScore.onTime, delayCount: components.taskScore.delay, notDoneCount: components.taskScore.notDone,
  };
  const existing = await tx.select({ id: misScores.id }).from(misScores)
    .where(and(eq(misScores.branchId, branchId), isNull(misScores.userId), eq(misScores.periodStart, periodStart))).limit(1);
  let id: string;
  if (existing.length) {
    id = existing[0].id;
    await tx.update(misScores).set(values).where(eq(misScores.id, id));
  } else {
    id = randomUUID();
    await tx.insert(misScores).values({ id, ...values });
  }
  return {
    branchId, branchName, computed: true, componentsUsed,
    score: {
      id, ...componentSnapshot(values),
      totalScore: values.totalScore, onTimeCount: values.onTimeCount, delayCount: values.delayCount, notDoneCount: values.notDoneCount,
    },
  };
}

export async function targetBranches(tx: Executor, branchId: string | null) {
  const rows = await tx.select({ id: branches.id, name: branches.name }).from(branches).where(branchId ? eq(branches.id, branchId) : undefined);
  if (branchId && !rows.length) throw new HttpError(404, "Branch not found");
  return rows;
}

// ---------------------------------------------------------------------------
// GET /api/mis/scores — read-only list, rank computed fresh on every read
// (never baked into the stored row, since rank is relative to whatever set
// is currently being viewed — e.g. one branch vs. the whole chain). This is
// the exact contract the Dashboard/Reports (3b) pass reads from.
// ---------------------------------------------------------------------------

export interface MisScoreRow {
  id: string; branchId: string; branchName: string; periodStart: string; periodEnd: string;
  taskScore: string | null; delegationScore: string | null; varianceScore: string | null; cashierScore: string | null; totalScore: string;
  missingReasons: Record<string, string>;
  onTimeCount: number; delayCount: number; notDoneCount: number; componentsUsed: MisComponentKey[]; rank: number;
}

export async function listMisScores(tx: Executor, actor: Identity, query: { branchId?: string | null; periodStart?: string | null; periodEnd?: string | null; periodMatch?: string | null }): Promise<MisScoreRow[]> {
  assertModule(actor, "MIS_PERFORMANCE");
  const scope = branchScope(actor, query.branchId || null);
  const conditions = [isNull(misScores.userId)];
  if (scope) conditions.push(eq(misScores.branchId, scope));
  if (query.periodMatch && query.periodMatch !== "exact") throw new HttpError(400, "Invalid periodMatch");
  const exact = query.periodMatch === "exact";
  if (exact && (!query.periodStart || !query.periodEnd)) throw new HttpError(400, "Exact period requires both bounds");
  if (query.periodStart) conditions.push((exact ? eq : gte)(misScores.periodStart, isoDate(query.periodStart, "periodStart")));
  if (query.periodEnd) conditions.push((exact ? eq : lte)(misScores.periodEnd, isoDate(query.periodEnd, "periodEnd")));
  if (query.periodStart && query.periodEnd && isoDate(query.periodStart, "periodStart") >= isoDate(query.periodEnd, "periodEnd")) throw new HttpError(400, "periodEnd must be after periodStart");
  const rows = await tx.select({
    id: misScores.id, branchId: misScores.branchId, branchName: branches.name,
    periodStart: misScores.periodStart, periodEnd: misScores.periodEnd,
    taskScore: misScores.taskScore, delegationScore: misScores.delegationScore, varianceScore: misScores.varianceScore, cashierScore: misScores.cashierScore,
    totalScore: misScores.totalScore, onTimeCount: misScores.onTimeCount, delayCount: misScores.delayCount, notDoneCount: misScores.notDoneCount,
  }).from(misScores).innerJoin(branches, eq(branches.id, misScores.branchId)).where(and(...conditions)).orderBy(desc(misScores.totalScore), desc(misScores.periodStart), misScores.branchId, misScores.id);

  return rows.map((row, index) => ({
    id: row.id, branchId: row.branchId, branchName: row.branchName,
    periodStart: row.periodStart.toISOString(), periodEnd: row.periodEnd.toISOString(),
    ...componentSnapshot(row), totalScore: row.totalScore,
    onTimeCount: row.onTimeCount, delayCount: row.delayCount, notDoneCount: row.notDoneCount,
    rank: index + 1,
  }));
}
