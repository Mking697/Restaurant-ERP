import { and, eq } from "drizzle-orm";
import { branchExpenses } from "@/db/schema/expenses";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { expensePermission, expenseScope, voidExpenseChanges } from "@/lib/server/expenses";
import { postExpenseVoidJournal } from "@/lib/server/accounts-ledger";
import { HttpError } from "@/lib/server/permissions";
import { expenseColumns } from "../../../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return api(async () => {
  const expense = await mutate(request, async (tx, actor) => {
    expensePermission(actor);
    const scope = expenseScope(actor), { id } = await context.params;
    const [existing] = await tx.select().from(branchExpenses).where(and(eq(branchExpenses.id, id), scope ? eq(branchExpenses.branchId, scope) : undefined)).limit(1);
    if (!existing) throw new HttpError(404, "Expense not found");
    const changes = voidExpenseChanges(existing, await body(request), actor);
    const [row] = await tx.update(branchExpenses).set(changes).where(and(eq(branchExpenses.id, id), eq(branchExpenses.status, "POSTED"))).returning(expenseColumns);
    if (!row) throw new HttpError(409, "Expense already voided");
    await postExpenseVoidJournal(tx, actor, { id: row.id, branchId: row.branchId, category: row.category, amount: row.amount });
    return row;
  });
  return json({ expense });
}); }
