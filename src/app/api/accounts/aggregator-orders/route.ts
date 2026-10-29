import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { aggregatorOrders } from "@/db/schema/accounts";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { aggregatorColumns, aggregatorTotals, aggregatorWindow, ensureLedgerBranch, ledgerMonth, postAggregatorOrder, queryBranchId } from "@/lib/server/accounts-ledger";
import { assertModule, branchScope } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "AGGREGATOR_RECON");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, queryBranchId(query.get("branchId")));
    const range = ledgerMonth(query.get("month"));
    await ensureLedgerBranch(db, scope);
    const orders = await db.select(aggregatorColumns).from(aggregatorOrders).where(aggregatorWindow(scope, range)).orderBy(asc(aggregatorOrders.orderDate), asc(aggregatorOrders.id));
    return json({ orders, totals: aggregatorTotals(orders), month: range.month });
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const order = await mutate(request, async (tx, actor) => postAggregatorOrder(tx, actor, await body(request)));
    return json({ order }, 201);
  });
}
