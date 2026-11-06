import { and, eq, gte, lt } from "drizzle-orm";
import { taskInstances } from "@/db/schema/tasks";
import type { Executor } from "./auth";
import type { Identity } from "./permissions";

// GAP (Nov 2026, Owner-requested): "My Performance" — a Doer's own
// completion score, breaking down exactly why it landed where it did
// (on-time / delayed / not-done per task), not a single opaque number.
// Deliberately separate from the branch-level MIS scorecard
// (src/lib/server/mis-scoring.ts-equivalent) which scores a BRANCH across
// several weighted components (task/delegation/variance/cashier); this is
// a simple, fully transparent per-person read over the Doer's own
// taskInstances rows only — no new table, no weighting beyond the rule
// below, so every point is traceable to a real task.
//
// Scoring rule (intentionally simple and explainable):
//   ON_TIME  (DONE, completedAt <= dueAt)              = 100 points
//   DELAYED  (DONE, completedAt >  dueAt)               = 50 points
//   NOT_DONE (OVERDUE/ESCALATED/SKIPPED, or still
//             PENDING/IN_PROGRESS past its own dueAt)    = 0 points
//   OPEN     (PENDING/IN_PROGRESS, dueAt still in the
//             future) — excluded entirely, never penalized early.
// scorePercent = average points over every ON_TIME+DELAYED+NOT_DONE task
// in the window; null when there is nothing resolved yet (never 0 by
// default — 0 means "every resolved task failed", not "no data").

export type TaskOutcome = "ON_TIME" | "DELAYED" | "NOT_DONE" | "OPEN";

export interface MyPerformanceTask {
  id: string;
  title: string;
  type: "RECURRING" | "ONE_TIME";
  branchId: string;
  dueAt: string;
  completedAt: string | null;
  status: string;
  outcome: TaskOutcome;
}

export interface MyPerformanceResult {
  periodStart: string;
  periodEnd: string;
  totalCount: number;
  onTimeCount: number;
  delayedCount: number;
  notDoneCount: number;
  openCount: number;
  scorePercent: number | null;
  tasks: MyPerformanceTask[];
}

export async function getMyPerformance(
  tx: Executor,
  actor: Identity,
  periodStart: string,
  periodEnd: string,
): Promise<MyPerformanceResult> {
  const rows = await tx
    .select()
    .from(taskInstances)
    .where(
      and(
        eq(taskInstances.assignedToId, actor.id),
        gte(taskInstances.dueAt, new Date(periodStart)),
        lt(taskInstances.dueAt, new Date(periodEnd)),
      ),
    )
    .orderBy(taskInstances.dueAt);

  const now = Date.now();
  let onTime = 0, delayed = 0, notDone = 0, open = 0;

  const tasks: MyPerformanceTask[] = rows.map((row) => {
    let outcome: TaskOutcome;
    if (row.status === "DONE") {
      outcome = row.completedAt && row.completedAt.getTime() <= row.dueAt.getTime() ? "ON_TIME" : "DELAYED";
    } else if (row.status === "OVERDUE" || row.status === "ESCALATED" || row.status === "SKIPPED") {
      outcome = "NOT_DONE";
    } else if (row.dueAt.getTime() < now) {
      // Still PENDING/IN_PROGRESS past its own due time — the 30-min
      // overdue cron may not have flagged it yet, but it is late now.
      outcome = "NOT_DONE";
    } else {
      outcome = "OPEN";
    }
    if (outcome === "ON_TIME") onTime++;
    else if (outcome === "DELAYED") delayed++;
    else if (outcome === "NOT_DONE") notDone++;
    else open++;
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      branchId: row.branchId,
      dueAt: row.dueAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      status: row.status,
      outcome,
    };
  });

  const resolved = onTime + delayed + notDone;
  const scorePercent = resolved > 0 ? Math.round(((onTime * 100 + delayed * 50) / resolved) * 100) / 100 : null;

  return {
    periodStart,
    periodEnd,
    totalCount: rows.length,
    onTimeCount: onTime,
    delayedCount: delayed,
    notDoneCount: notDone,
    openCount: open,
    scorePercent,
    tasks,
  };
}
