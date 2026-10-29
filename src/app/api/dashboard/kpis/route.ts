import { and, eq, gte, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { posOrders } from "@/db/schema/pos";
import { inventoryStock, nightVarianceEntries } from "@/db/schema/inventory";
import { taskInstances } from "@/db/schema/tasks";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { operationalOrderVisibility } from "@/lib/server/order-visibility";
import { listMisScores } from "@/app/api/mis/_shared";
import { computeInventoryValue, istDayKey, istDayRange, istMonthRange, sumMoneyInr } from "@/app/api/reports/_aggregation";
import { branchFoodCost, closingCash, foodRates, inventoryRates, reportBranches } from "@/app/api/reports/_data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "DASHBOARD_OWNER");
    const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const now = new Date(), today = istDayRange(now), month = istMonthRange(now);
    const [branches, valuationRates, costingRates, cash] = await Promise.all([reportBranches(scope), inventoryRates(), foodRates(), closingCash(scope)]);
    // Reuse 3a's permission-checked read, not a self-HTTP call: production
    // intentionally has no APP_ORIGIN, and no session cookie needs forwarding.
    // The underlying MIS grant still applies independently of Dashboard access.
    let scores: { branchId: string; totalScore: string; periodStart: string; periodEnd: string }[] = [];
    let misReason: string | null = null;
    if (actor.role === "SUPER_ADMIN" || actor.moduleAccess.includes("MIS_PERFORMANCE")) {
      scores = await listMisScores(db, actor, { branchId: scope });
    } else misReason = "MIS_PERFORMANCE access required to read MIS scores";
    const orders = await db.select({ branchId: posOrders.branchId, createdAt: posOrders.createdAt, channel: posOrders.channel, totalAmount: posOrders.totalAmount }).from(posOrders).where(and(scope ? eq(posOrders.branchId, scope) : undefined, eq(posOrders.status, "COMPLETED"), gte(posOrders.createdAt, month.start), lt(posOrders.createdAt, month.end), operationalOrderVisibility(actor)));
    const results = await Promise.all(branches.map(async (branch) => {
      const stock = await db.select().from(inventoryStock).where(eq(inventoryStock.branchId, branch.id));
      const inventory = computeInventoryValue(stock, valuationRates);
      const [{ count: overdue }] = await db.select({ count: sql<number>`count(*)::int` }).from(taskInstances).where(and(eq(taskInstances.branchId, branch.id), or(eq(taskInstances.status, "OVERDUE"), and(lt(taskInstances.dueAt, now), notInArray(taskInstances.status, ["DONE", "SKIPPED"])))));
      const [{ count: flags }] = await db.select({ count: sql<number>`count(*)::int` }).from(nightVarianceEntries).where(and(eq(nightVarianceEntries.branchId, branch.id), eq(nightVarianceEntries.flaggedPilferage, true), gte(nightVarianceEntries.shiftDate, istDayKey(new Date(now.getTime() - 29 * 86400000))), lt(nightVarianceEntries.shiftDate, istDayKey(today.end))));
      const latestMis = scores.filter((s) => s.branchId === branch.id).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart))[0];
      const latestCash = cash.find((r) => r.branchId === branch.id);
      const food = await branchFoodCost(actor, branch.id, { start: month.start, end: now }, costingRates);
      const sales = orders.filter((o) => o.branchId === branch.id);
      const revenueToday = Number(sumMoneyInr(sales.filter((o) => o.createdAt >= today.start && o.createdAt <= now).map((o) => o.totalAmount)));
      const revenueMtd = Number(sumMoneyInr(sales.filter((o) => o.createdAt <= now).map((o) => o.totalAmount)));
      return {
        branchId: branch.id, branchName: branch.name, revenueToday, revenueMtd,
        revenueTodayInr: revenueToday.toFixed(2), revenueMtdInr: revenueMtd.toFixed(2),
        ...inventory, inventoryValueNote: inventory.ratesMissingForCount ? "Partial valuation only: materialsMissingRateIds are excluded; latest known locked vendor rates used" : "Latest known vendor rates; not a posted inventory ledger value",
        openTasksOverdue: overdue, pilferageFlags: flags,
        misScore: latestMis ? Number(latestMis.totalScore) : null, misScoreNote: latestMis ? null : misReason ?? "No computed MIS score for this branch",
        misScorePeriod: latestMis ? { periodStart: latestMis.periodStart, periodEnd: latestMis.periodEnd } : null,
        cashVarianceInr: latestCash ? Number(latestCash.shortageExcessInr) : null, cashVarianceNote: latestCash ? null : "No closed shift with a closing handover/drop",
        primeCostPercent: null, primeCostNote: "Period-allocated labor cost is not connected; prime cost cannot be computed honestly",
        foodCostPercent: food.foodCostPercent, foodCostExcludedCount: food.excludedCount + food.excludedOrders.length, foodCostNote: food.reason,
      };
    }));
    const channels = new Map<string, string[]>();
    for (const row of orders.filter((o) => o.createdAt <= now)) channels.set(row.channel, [...channels.get(row.channel) ?? [], row.totalAmount]);
    return json({ branches: results, channelSplit: [...channels].map(([channel, amounts]) => ({ channel, revenueInr: Number(sumMoneyInr(amounts)) })), compiled: scope === null, timezone: "Asia/Kolkata", asOf: now.toISOString() });
  });
}
