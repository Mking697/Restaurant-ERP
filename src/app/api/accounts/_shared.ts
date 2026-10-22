import { and, eq, gte, lt } from "drizzle-orm";
import { branchExpenses } from "@/db/schema/expenses";
import { branches } from "@/db/schema/platform";
import type { Executor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/permissions";

export const expenseColumns = {
  id: branchExpenses.id, branchId: branchExpenses.branchId, date: branchExpenses.date,
  category: branchExpenses.category, subcategory: branchExpenses.subcategory, amount: branchExpenses.amount,
  description: branchExpenses.description, reference: branchExpenses.reference, status: branchExpenses.status,
  createdById: branchExpenses.createdById, createdAt: branchExpenses.createdAt,
  voidReason: branchExpenses.voidReason, voidedById: branchExpenses.voidedById, voidedAt: branchExpenses.voidedAt,
};
export async function ensureExpenseBranch(tx: Executor, branchId: string | null) {
  if (branchId && !(await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1)).length) throw new HttpError(404, "Branch not found");
}
export function expenseWindow(branchId: string | null, range: { start: string; end: string }) {
  return and(branchId ? eq(branchExpenses.branchId, branchId) : undefined, gte(branchExpenses.date, range.start), lt(branchExpenses.date, range.end));
}
