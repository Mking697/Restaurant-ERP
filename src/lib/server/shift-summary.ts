import { and, desc, eq } from "drizzle-orm";
import { posOrders } from "../../db/schema/pos";
import type { Executor } from "./auth";
import { operationalOrderVisibility, salesSummaryFor } from "./order-visibility";
import { readPosCollectionTenders } from "./pos-collections";
import { branchScope, HttpError, type Identity } from "./permissions";
import { currentOpenRun, fromCents, toCents } from "./shifts";

// ---------------------------------------------------------------------------
// GAP-034: a read-only live summary for the branch's CURRENT open shift run
// — completed/paid sales so far, actual collected Cash/Card/UPI/Other (the
// same GAP-026 collection seam shift-close uses, read live without ending
// the run), and the branch's currently OPEN/unpaid orders (which may have
// been dispatched under an earlier, already-ended run — carried over by
// policy, never force-marked completed or counted as cash). No independent
// editable totals table: this is purely a read-model over existing GAP-024
// order/GAP-026 payment data, same visibility-filtered vs. actual-custody
// dual labeling convention as /api/pos/orders and the Cash Drop screen.
// ---------------------------------------------------------------------------

const PENDING_ORDER_LIMIT = 200;

export interface LiveShiftSummary {
  run: { id: string; label: string; startedAt: string } | null;
  visibilityScope: "actual" | "access-filtered";
  // Actual custody cash — same convention as Cash Drop's reconciliation:
  // always the real total, never owner-only filtered.
  collectedTenders: { cash: string; card: string; upi: string; other: string };
  completed: { count: number; visibleTotal: string; actualTotal?: string; privateTotal?: string };
  pendingOrders: {
    orders: { id: string; orderNumber: string; channel: string; tableNo: string; totalAmount: string; createdAt: string; shiftRunId: string; ownerOnly?: boolean }[];
    limit: number; truncated: boolean;
    visibleTotal: string; actualTotal?: string; privateTotal?: string;
  };
}

export async function liveShiftSummary(tx: Executor, actor: Identity, branchId: unknown): Promise<LiveShiftSummary> {
  const scope = branchScope(actor, typeof branchId === "string" ? branchId : undefined);
  if (!scope) throw new HttpError(400, "Select a branch");
  const visibilityScope = actor.role === "SUPER_ADMIN" ? "actual" as const : "access-filtered" as const;
  const permitted = operationalOrderVisibility(actor);

  const run = await currentOpenRun(tx, scope);
  const pendingTotalsFor = async () => {
    // Computed in JS (toCents/fromCents), same convention as every other
    // money aggregate in this codebase — avoids a DB-side SQL aggregate and
    // keeps this fully testable against the same in-memory row-filter mock
    // used elsewhere. OPEN orders are bounded by real operational scale
    // (a branch cannot realistically have thousands of simultaneously open
    // unpaid tables), so fetching the full matching set once is safe.
    const rows = await tx.select({ id: posOrders.id, orderNumber: posOrders.orderNumber, channel: posOrders.channel, tableNo: posOrders.tableNo, totalAmount: posOrders.totalAmount, createdAt: posOrders.createdAt, shiftRunId: posOrders.shiftRunId, ownerOnly: posOrders.ownerOnly })
      .from(posOrders).where(and(eq(posOrders.branchId, scope), eq(posOrders.status, "OPEN"), permitted)).orderBy(desc(posOrders.createdAt));
    let actualCents = 0n, visibleCents = 0n;
    for (const row of rows) {
      const cents = toCents(row.totalAmount);
      actualCents += cents;
      if (!row.ownerOnly) visibleCents += cents;
    }
    const truncated = rows.length > PENDING_ORDER_LIMIT;
    const orders = rows.slice(0, PENDING_ORDER_LIMIT).map(row => {
      const { ownerOnly, ...rest } = row;
      return { ...rest, createdAt: rest.createdAt instanceof Date ? rest.createdAt.toISOString() : rest.createdAt, ...(actor.role === "SUPER_ADMIN" ? { ownerOnly } : {}) };
    });
    return { orders, limit: PENDING_ORDER_LIMIT, truncated, ...salesSummaryFor(actor, { actualTotal: fromCents(actualCents), visibleTotal: fromCents(visibleCents) }) };
  };

  if (!run) {
    return { run: null, visibilityScope, collectedTenders: { cash: "0.00", card: "0.00", upi: "0.00", other: "0.00" }, completed: { count: 0, ...salesSummaryFor(actor, { actualTotal: "0.00", visibleTotal: "0.00" }) }, pendingOrders: await pendingTotalsFor() };
  }

  // Actual collected tenders for THIS run so far — live, without ending it.
  const tenders = await readPosCollectionTenders(tx, scope, run.id);
  let cashCents = 0n, cardCents = 0n, upiCents = 0n, otherCents = 0n;
  for (const row of tenders) {
    const cents = toCents(row.totalAmount);
    if (row.tenderType === "CASH") cashCents += cents;
    else if (row.tenderType === "CARD" || row.tenderType === "CREDIT_CARD" || row.tenderType === "DEBIT_CARD") cardCents += cents;
    else if (row.tenderType === "UPI") upiCents += cents;
    else otherCents += cents;
  }

  const completedRows = await tx.select({ status: posOrders.status, totalAmount: posOrders.totalAmount, ownerOnly: posOrders.ownerOnly }).from(posOrders)
    .where(and(eq(posOrders.branchId, scope), eq(posOrders.shiftRunId, run.id)));
  let completedActualCents = 0n, completedVisibleCents = 0n, completedCount = 0;
  for (const row of completedRows) {
    if (row.status !== "PAID" && row.status !== "COMPLETED") continue;
    completedCount++;
    const cents = toCents(row.totalAmount);
    completedActualCents += cents;
    if (!row.ownerOnly) completedVisibleCents += cents;
  }

  return {
    run: { id: run.id, label: run.label, startedAt: run.startedAt instanceof Date ? run.startedAt.toISOString() : run.startedAt },
    visibilityScope,
    collectedTenders: { cash: fromCents(cashCents), card: fromCents(cardCents), upi: fromCents(upiCents), other: fromCents(otherCents) },
    completed: { count: completedCount, ...salesSummaryFor(actor, { actualTotal: fromCents(completedActualCents), visibleTotal: fromCents(completedVisibleCents) }) },
    pendingOrders: await pendingTotalsFor(),
  };
}
