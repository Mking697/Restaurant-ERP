import { and, eq, inArray, ne, notExists, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { taskInstances } from "@/db/schema/tasks";
import { shiftHandovers, hoCashDispatches } from "@/db/schema/shifts";
import { workforceLeaves } from "@/db/schema/workforce";
import { indents, grns, threeWayMatch } from "@/db/schema/purchase";
import { stockCounts } from "@/db/schema/stock-count";
import { hoStockReviewSubjects, hoStockReviewEvents } from "@/db/schema/stock-review";
import { hasModule, type Identity } from "./permissions";

// ---------------------------------------------------------------------------
// "Pending work" — federated read across each module's own existing tables.
// No new central table: every row already carries its own status/actor/
// branch, so this just asks each module "what is waiting on this actor right
// now", scoped by their branch and module grants. Counting/aggregation only
// — never changes anything.
// ---------------------------------------------------------------------------

export interface PendingWorkItem {
  type: string;
  count: number;
  href: string;
  branchName?: string;
}

function branchFilter(actor: Identity, column: AnyPgColumn) {
  return actor.role === "SUPER_ADMIN" ? undefined : eq(column, actor.branchId ?? "__none__");
}

export async function getPendingWorkForActor(actor: Identity): Promise<PendingWorkItem[]> {
  const items: PendingWorkItem[] = [];
  const isOwner = actor.role === "SUPER_ADMIN";
  const push = (type: string, count: number, href: string) => { if (count > 0) items.push({ type, count, href }); };

  // 1. My own tasks — assigned to this exact user, not yet done. Always
  // checked: a task can be assigned to anyone regardless of module grants.
  {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(taskInstances)
      .where(and(eq(taskInstances.assignedToId, actor.id), inArray(taskInstances.status, ["PENDING", "IN_PROGRESS", "OVERDUE"])));
    push("my_tasks", row?.count ?? 0, "/tasks");
  }

  // 2. Shift handover to accept, at this branch.
  if (hasModule(actor, "CASH_DROP") && (isOwner || actor.branchId)) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(shiftHandovers)
      .where(and(eq(shiftHandovers.status, "PENDING"), branchFilter(actor, shiftHandovers.branchId) ?? sql`true`));
    push("shift_handover", row?.count ?? 0, "/cash-drop");
  }

  // 3. HO cash dispatch awaiting Owner acceptance.
  if (isOwner) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(hoCashDispatches)
      .where(and(eq(hoCashDispatches.status, "PENDING"), ne(hoCashDispatches.dispatchedBy, actor.id)));
    push("ho_cash_dispatch", row?.count ?? 0, "/cash-drop");
  }

  // 4. Leave requests waiting for this reviewer (never their own submission).
  if (hasModule(actor, "LEAVE_APPROVAL")) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(workforceLeaves)
      .where(and(eq(workforceLeaves.status, "PENDING"), ne(workforceLeaves.requestedById, actor.id), branchFilter(actor, workforceLeaves.branchId) ?? sql`true`));
    push("leave_review", row?.count ?? 0, "/workforce");
  }

  // 5. Indents waiting for Owner approval (quantity-spike / value-threshold gate).
  if (isOwner) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(indents).where(eq(indents.status, "PENDING_APPROVAL"));
    push("indent_approval", row?.count ?? 0, "/purchase");
  }

  // 6. Physical stock counts submitted, waiting for a different reviewer.
  if (hasModule(actor, "INVENTORY")) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(stockCounts)
      .where(and(eq(stockCounts.status, "SUBMITTED"), ne(stockCounts.submittedById, actor.id), branchFilter(actor, stockCounts.branchId) ?? sql`true`));
    push("stock_count_review", row?.count ?? 0, "/inventory");
  }

  // 7. GRNs received, waiting for quality check.
  if (hasModule(actor, "PURCHASE_ORDER")) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(grns)
      .where(and(eq(grns.qualityResult, "PENDING"), branchFilter(actor, grns.branchId) ?? sql`true`));
    push("grn_quality", row?.count ?? 0, "/purchase");
  }

  // 8/9. Vendor invoices matched-and-waiting-approval, or approved-and-waiting-payment.
  if (hasModule(actor, "ACCOUNTS_EXPENSES")) {
    const [approvalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(threeWayMatch)
      .where(and(eq(threeWayMatch.paymentStatus, "PENDING"), eq(threeWayMatch.matched, true), branchFilter(actor, threeWayMatch.branchId) ?? sql`true`));
    push("invoice_approval", approvalRow?.count ?? 0, "/purchase");
    const [paymentRow] = await db.select({ count: sql<number>`count(*)::int` }).from(threeWayMatch)
      .where(and(eq(threeWayMatch.paymentStatus, "APPROVED"), branchFilter(actor, threeWayMatch.branchId) ?? sql`true`));
    push("invoice_payment", paymentRow?.count ?? 0, "/purchase");
  }

  // 10. HO stock review subjects still open (never acknowledged yet).
  if (hasModule(actor, "HO_STOCK_REVIEW") || isOwner) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(hoStockReviewSubjects)
      .where(notExists(db.select().from(hoStockReviewEvents).where(and(eq(hoStockReviewEvents.subjectId, hoStockReviewSubjects.id), eq(hoStockReviewEvents.action, "ACKNOWLEDGE")))));
    push("ho_stock_review", row?.count ?? 0, "/ho-stock-review");
  }

  return items;
}
