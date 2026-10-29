import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { posOrders } from "@/db/schema/pos";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { operationalOrderVisibility } from "@/lib/server/order-visibility";
import { queryBranchId } from "@/lib/server/accounts-ledger";
import { reportBranches } from "../_data";
import { groupRevenueByDay, istDayRange, parseDaysParam } from "@/app/api/reports/_aggregation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/reports/sales-trend?branchId=&days= — real daily COMPLETED-sale
// revenue trend from pos_orders, replacing mock-data.ts's getRevenueTrend14d().
// branchId omitted = compiled across every branch (summed per day) for an
// Owner. primeCostPercent is deliberately NOT included per day — a real
// daily prime-cost figure is out of scope this pass (see dashboard/kpis'
// primeCostPercent note); the old mock's per-day prime-cost number has no
// real replacement yet rather than being faked.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "REPORTS");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, queryBranchId(query.get("branchId")));
    const days = parseDaysParam(query.get("days"));
    await reportBranches(scope);

    const now = new Date();
    const windowStart = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const start = istDayRange(windowStart).start;
    const end = istDayRange(now).end;

    const rows = await db
      .select({ createdAt: posOrders.createdAt, totalAmount: posOrders.totalAmount })
      .from(posOrders)
      .where(and(scope ? eq(posOrders.branchId, scope) : undefined, eq(posOrders.status, "COMPLETED"), gte(posOrders.createdAt, start), lt(posOrders.createdAt, end), operationalOrderVisibility(actor)));

    const trend = groupRevenueByDay(rows, days, now);
    return json({ branchId: scope, days, trend, notes: ["Real daily revenue from completed pos_orders, respecting operational order visibility.", "primeCostPercent is not included per-day this pass — no real daily-granularity prime-cost figure exists yet."] });
  });
}
