import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { branchExpenses } from "@/db/schema/expenses";
import { payrollSnapshots } from "@/db/schema/workforce";
import { posOrders } from "@/db/schema/pos";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { expenseMonth, expensePermission, expenseProfitLoss, expenseScope } from "@/lib/server/expenses";
import { operationalOrderVisibility } from "@/lib/server/order-visibility";
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
  // Revenue — real SUM of completed POS sales for this branch/month. Applies
  // the exact same owner-only operational privacy rule GET /api/pos/orders
  // uses (src/lib/server/order-visibility.ts): a non-Owner viewer's figure
  // never includes an order marked private. coalesce(...,0) guarantees a
  // real "0.00" for a zero-sales branch/month, never null/undefined.
  const [revenueRow] = await db
    .select({ revenue: sql<string>`coalesce(sum(${posOrders.totalAmount}), 0)::numeric(20,2)::text` })
    .from(posOrders)
    .where(and(
      scope ? eq(posOrders.branchId, scope) : undefined,
      gte(posOrders.createdAt, new Date(range.start)),
      lt(posOrders.createdAt, new Date(range.end)),
      eq(posOrders.status, "COMPLETED"),
      operationalOrderVisibility(actor)
    ));
  // COGS — real sum of each completed order's own captured cogsAmount
  // (src/lib/server/cogs.ts, set once at order-confirm time). cogsComplete
  // is withheld (treated as false) for the whole period the moment ANY one
  // completed order in it priced incompletely, so expenseProfitLoss never
  // understates gross profit from a partial sum.
  const [cogsRow] = await db
    .select({
      cogs: sql<string>`coalesce(sum(${posOrders.cogsAmount}), 0)::numeric(20,2)::text`,
      cogsComplete: sql<boolean>`coalesce(bool_and(${posOrders.cogsComplete}), true)`,
    })
    .from(posOrders)
    .where(and(
      scope ? eq(posOrders.branchId, scope) : undefined,
      gte(posOrders.createdAt, new Date(range.start)),
      lt(posOrders.createdAt, new Date(range.end)),
      eq(posOrders.status, "COMPLETED"),
      operationalOrderVisibility(actor)
    ));
  return json(expenseProfitLoss(range.month, expenses, payroll, revenueRow.revenue, cogsRow.cogs, cogsRow.cogsComplete));
}); }
