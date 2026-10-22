import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branchExpenses } from "@/db/schema/expenses";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertExpenseReplay, expenseMonth, expensePermission, expenseProfitLoss, expenseScope, parseExpense } from "@/lib/server/expenses";
import { ensureExpenseBranch, expenseColumns, expenseWindow } from "../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request); expensePermission(actor);
  const query = new URL(request.url).searchParams;
  const scope = expenseScope(actor, query.get("branchId")), range = expenseMonth(query.get("month"));
  await ensureExpenseBranch(db, scope);
  const expenses = await db.select(expenseColumns).from(branchExpenses).where(expenseWindow(scope, range)).orderBy(desc(branchExpenses.date), desc(branchExpenses.createdAt), branchExpenses.id);
  return json({ expenses, totals: expenseProfitLoss(range.month, expenses, []).expenses, month: range.month });
}); }
export async function POST(request: Request) { return api(async () => {
  const expense = await mutate(request, async (tx, actor) => {
    expensePermission(actor);
    const input = parseExpense(await body(request));
    const branchId = expenseScope(actor, input.branchId, true)!;
    await ensureExpenseBranch(tx, branchId);
    const [existing] = await tx.select().from(branchExpenses).where(and(eq(branchExpenses.branchId, branchId), eq(branchExpenses.createdById, actor.id), eq(branchExpenses.idempotencyKey, input.idempotencyKey))).limit(1);
    if (existing) {
      assertExpenseReplay(existing, input);
      const [row] = await tx.select(expenseColumns).from(branchExpenses).where(eq(branchExpenses.id, existing.id)); return row;
    }
    const [row] = await tx.insert(branchExpenses).values({ ...input, id: randomUUID(), branchId, createdById: actor.id }).returning(expenseColumns);
    return row;
  });
  return json({ expense }, 201);
}); }
