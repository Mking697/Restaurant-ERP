import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branchExpenses } from "@/db/schema/expenses";
import { payrollSnapshots } from "@/db/schema/workforce";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { expenseMonth, expensePermission, expenseProfitLoss, expenseScope } from "@/lib/server/expenses";
import { ensureExpenseBranch, expenseWindow } from "../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request); expensePermission(actor, true);
  const query = new URL(request.url).searchParams;
  const scope = expenseScope(actor, query.get("branchId")), range = expenseMonth(query.get("month"));
  await ensureExpenseBranch(db, scope);
  const expenses = await db.select({ category: branchExpenses.category, amount: branchExpenses.amount, status: branchExpenses.status }).from(branchExpenses).where(expenseWindow(scope, range));
  // payrollSnapshots contains finalized rows ONLY. Do not read draft preview rows,
  // payroll rates, the old branchFinancials demo table, or arbitrary journals.
  const payroll = await db.select({ amount: payrollSnapshots.amount }).from(payrollSnapshots).where(and(eq(payrollSnapshots.month, range.month), scope ? eq(payrollSnapshots.branchId, scope) : undefined));
  return json(expenseProfitLoss(range.month, expenses, payroll));
}); }
