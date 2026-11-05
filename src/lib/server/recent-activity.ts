import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { branches } from "@/db/schema/platform";
import { posOrders } from "@/db/schema/pos";
import { posOrderReversals } from "@/db/schema/pos-order-reversals";
import { indents, grns, threeWayMatch } from "@/db/schema/purchase";
import { stockCounts } from "@/db/schema/stock-count";
import { shiftRuns, hoCashDispatches } from "@/db/schema/shifts";
import { taskInstances } from "@/db/schema/tasks";
import { workforceLeaves, payrollRuns } from "@/db/schema/workforce";
import { branchExpenses } from "@/db/schema/expenses";

// ---------------------------------------------------------------------------
// Owner "Recent Activity" — a federated read, not a new audit-log table.
// Every module already stamps actor+timestamp on its own rows; this just
// queries the last `sinceDays` of each one, joins the actor's name and the
// branch name, and merges everything into one time-ordered list. Read-only,
// refreshed on page load (no polling/websocket).
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  type: string;
  at: string; // ISO timestamp
  actorName: string;
  branchName: string;
  summary: string;
}

export async function getRecentActivity(scopeBranchId: string | null, sinceDays = 7): Promise<ActivityEvent[]> {
  const since = new Date(Date.now() - sinceDays * 86400000);
  const branchClause = (col: AnyPgColumn) => (scopeBranchId ? eq(col, scopeBranchId) : undefined);
  const events: ActivityEvent[] = [];

  const [orders, voids, indentRows, grnRows, invoiceRows, countRows, shiftRows, hoRows, taskRows, leaveRows, payrollRows, expenseRows] = await Promise.all([
    db.select({ at: posOrders.createdAt, actor: users.name, branch: branches.name, orderNumber: posOrders.orderNumber, amount: posOrders.totalAmount, channel: posOrders.channel })
      .from(posOrders).innerJoin(users, eq(users.id, posOrders.cashierId)).innerJoin(branches, eq(branches.id, posOrders.branchId))
      .where(and(gte(posOrders.createdAt, since), inArray(posOrders.status, ["PAID", "COMPLETED"]), branchClause(posOrders.branchId))).orderBy(desc(posOrders.createdAt)).limit(100),

    db.select({ at: posOrderReversals.createdAt, actor: posOrderReversals.actorName, branch: branches.name, reason: posOrderReversals.reason })
      .from(posOrderReversals).innerJoin(branches, eq(branches.id, posOrderReversals.branchId))
      .where(and(gte(posOrderReversals.createdAt, since), branchClause(posOrderReversals.branchId))).orderBy(desc(posOrderReversals.createdAt)).limit(50),

    db.select({ at: indents.createdAt, actor: users.name, branch: branches.name, status: indents.status })
      .from(indents).innerJoin(users, eq(users.id, indents.raisedById)).innerJoin(branches, eq(branches.id, indents.branchId))
      .where(and(gte(indents.createdAt, since), branchClause(indents.branchId))).orderBy(desc(indents.createdAt)).limit(50),

    db.select({ at: grns.createdAt, actor: users.name, branch: branches.name, result: grns.qualityResult })
      .from(grns).innerJoin(users, eq(users.id, grns.receivedById)).innerJoin(branches, eq(branches.id, grns.branchId))
      .where(and(gte(grns.createdAt, since), branchClause(grns.branchId))).orderBy(desc(grns.createdAt)).limit(50),

    db.select({ at: threeWayMatch.paidAt, actor: users.name, branch: branches.name })
      .from(threeWayMatch).innerJoin(users, eq(users.id, threeWayMatch.paidById)).innerJoin(branches, eq(branches.id, threeWayMatch.branchId))
      .where(and(isNotNull(threeWayMatch.paidAt), gte(threeWayMatch.paidAt, since), branchClause(threeWayMatch.branchId))).orderBy(desc(threeWayMatch.paidAt)).limit(50),

    db.select({ at: stockCounts.approvedAt, actor: users.name, branch: branches.name, status: stockCounts.status })
      .from(stockCounts).innerJoin(users, eq(users.id, stockCounts.approvedById)).innerJoin(branches, eq(branches.id, stockCounts.branchId))
      .where(and(isNotNull(stockCounts.approvedAt), gte(stockCounts.approvedAt, since), branchClause(stockCounts.branchId))).orderBy(desc(stockCounts.approvedAt)).limit(50),

    db.select({ at: shiftRuns.endedAt, actor: users.name, branch: branches.name })
      .from(shiftRuns).innerJoin(users, eq(users.id, shiftRuns.endedBy)).innerJoin(branches, eq(branches.id, shiftRuns.branchId))
      .where(and(isNotNull(shiftRuns.endedAt), gte(shiftRuns.endedAt, since), branchClause(shiftRuns.branchId))).orderBy(desc(shiftRuns.endedAt)).limit(50),

    db.select({ at: hoCashDispatches.dispatchedAt, actor: users.name, branch: branches.name, amount: hoCashDispatches.dispatchedAmountInr })
      .from(hoCashDispatches).innerJoin(users, eq(users.id, hoCashDispatches.dispatchedBy)).innerJoin(branches, eq(branches.id, hoCashDispatches.branchId))
      .where(and(gte(hoCashDispatches.dispatchedAt, since), branchClause(hoCashDispatches.branchId))).orderBy(desc(hoCashDispatches.dispatchedAt)).limit(50),

    db.select({ at: taskInstances.completedAt, actor: users.name, branch: branches.name, title: taskInstances.title })
      .from(taskInstances).innerJoin(users, eq(users.id, taskInstances.assignedToId)).innerJoin(branches, eq(branches.id, taskInstances.branchId))
      .where(and(eq(taskInstances.status, "DONE"), isNotNull(taskInstances.completedAt), gte(taskInstances.completedAt, since), branchClause(taskInstances.branchId))).orderBy(desc(taskInstances.completedAt)).limit(100),

    db.select({ at: workforceLeaves.reviewedAt, actor: users.name, branch: branches.name, status: workforceLeaves.status })
      .from(workforceLeaves).innerJoin(users, eq(users.id, workforceLeaves.reviewedById)).innerJoin(branches, eq(branches.id, workforceLeaves.branchId))
      .where(and(isNotNull(workforceLeaves.reviewedAt), gte(workforceLeaves.reviewedAt, since), branchClause(workforceLeaves.branchId))).orderBy(desc(workforceLeaves.reviewedAt)).limit(50),

    db.select({ at: payrollRuns.finalizedAt, actor: users.name, branch: branches.name, month: payrollRuns.month })
      .from(payrollRuns).innerJoin(users, eq(users.id, payrollRuns.finalizedById)).innerJoin(branches, eq(branches.id, payrollRuns.branchId))
      .where(and(gte(payrollRuns.finalizedAt, since), branchClause(payrollRuns.branchId))).orderBy(desc(payrollRuns.finalizedAt)).limit(50),

    db.select({ at: branchExpenses.createdAt, actor: users.name, branch: branches.name, amount: branchExpenses.amount, category: branchExpenses.category })
      .from(branchExpenses).innerJoin(users, eq(users.id, branchExpenses.createdById)).innerJoin(branches, eq(branches.id, branchExpenses.branchId))
      .where(and(eq(branchExpenses.status, "POSTED"), gte(branchExpenses.createdAt, since), branchClause(branchExpenses.branchId))).orderBy(desc(branchExpenses.createdAt)).limit(50),
  ]);

  for (const r of orders) events.push({ type: "pos_order", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Order ${r.orderNumber} (${r.channel}) — TSh ${Number(r.amount).toLocaleString("en-TZ")}` });
  for (const r of voids) events.push({ type: "pos_void", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Voided a paid order — ${r.reason}` });
  for (const r of indentRows) events.push({ type: "indent_raised", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Raised an indent (${r.status})` });
  for (const r of grnRows) events.push({ type: "grn_quality", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `GRN quality: ${r.result}` });
  for (const r of invoiceRows) if (r.at) events.push({ type: "invoice_paid", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: "Marked a vendor invoice paid" });
  for (const r of countRows) if (r.at) events.push({ type: "stock_count", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Stock count ${r.status.toLowerCase()}` });
  for (const r of shiftRows) if (r.at) events.push({ type: "shift_closed", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: "Closed a shift" });
  for (const r of hoRows) events.push({ type: "ho_cash_dispatch", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Dispatched TSh ${Number(r.amount).toLocaleString("en-TZ")} cash to Head Office` });
  for (const r of taskRows) if (r.at) events.push({ type: "task_done", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Completed task "${r.title}"` });
  for (const r of leaveRows) if (r.at) events.push({ type: "leave_reviewed", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Leave request ${r.status.toLowerCase()}` });
  for (const r of payrollRows) events.push({ type: "payroll_finalized", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Finalized payroll for ${r.month}` });
  for (const r of expenseRows) events.push({ type: "expense_posted", at: r.at.toISOString(), actorName: r.actor, branchName: r.branch, summary: `Posted ${r.category.toLowerCase()} expense — TSh ${Number(r.amount).toLocaleString("en-TZ")}` });

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
}
