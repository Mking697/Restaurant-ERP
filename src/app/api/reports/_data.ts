import { and, desc, eq, gte, inArray, lt, min } from "drizzle-orm";
import { db } from "@/db/client";
import { branches } from "@/db/schema/platform";
import { posOrders, posOrderLines, cashDrops } from "@/db/schema/pos";
import { shiftRuns, shiftHandovers } from "@/db/schema/shifts";
import { users } from "@/db/schema/auth";
import { bomRecipes, menuItems } from "@/db/schema/menu";
import { vendorRates } from "@/db/schema/vendors";
import { HttpError, type Identity } from "@/lib/server/permissions";
import { operationalOrderVisibility } from "@/lib/server/order-visibility";
import { allocateSaleRevenue, buildRecipeIndex, computeFoodCost, istDayKey, istMonthRange, sumMoneyInr, type SoldLine } from "./_aggregation";

export async function reportBranches(scope: string | null) {
  const rows = await db.select({ id: branches.id, name: branches.name }).from(branches).where(scope ? eq(branches.id, scope) : undefined).orderBy(branches.name);
  if (scope && !rows.length) throw new HttpError(404, "Branch not found");
  return rows;
}
export function reportMonth(value: string | null) {
  const month = value ?? istDayKey(new Date()).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000) throw new HttpError(400, "Invalid month");
  return { month, ...istMonthRange(new Date(`${month}-15T00:00:00Z`)) };
}
export async function foodRates() {
  const rows = await db.select({ rawMaterialId: vendorRates.rawMaterialId, rate: min(vendorRates.rate) }).from(vendorRates).where(eq(vendorRates.isActive, true)).groupBy(vendorRates.rawMaterialId);
  return new Map(rows.map((r) => [r.rawMaterialId, Number(r.rate)]));
}
// Inventory valuation deliberately differs from BOM's lowest-active planning
// rate: contract requires the latest known vendor rate by lockedAt, id tie-break.
export async function inventoryRates() {
  const rows = await db.select().from(vendorRates).orderBy(desc(vendorRates.lockedAt), desc(vendorRates.id));
  const rates = new Map<string, number>();
  for (const row of rows) if (!rates.has(row.rawMaterialId)) rates.set(row.rawMaterialId, Number(row.rate));
  return rates;
}
export async function branchFoodCost(actor: Identity, branchId: string, range: { start: Date; end: Date }, rates: Map<string, number>) {
  const orders = await db.select({ id: posOrders.id, totalAmount: posOrders.totalAmount }).from(posOrders).where(and(eq(posOrders.branchId, branchId), eq(posOrders.status, "COMPLETED"), gte(posOrders.createdAt, range.start), lt(posOrders.createdAt, range.end), operationalOrderVisibility(actor)));
  const lines = orders.length ? await db.select({ id: posOrderLines.id, orderId: posOrderLines.orderId, menuItemId: posOrderLines.menuItemId, menuItemName: menuItems.name, price: posOrderLines.price, qty: posOrderLines.qty }).from(posOrderLines).innerJoin(menuItems, eq(menuItems.id, posOrderLines.menuItemId)).where(inArray(posOrderLines.orderId, orders.map((o) => o.id))).orderBy(posOrderLines.id) : [];
  const sold: SoldLine[] = [];
  const excludedOrders: { orderId: string; reason: string }[] = [];
  for (const order of orders) {
    const orderLines = lines.filter((l) => l.orderId === order.id);
    const allocations = allocateSaleRevenue(order.totalAmount, orderLines);
    if (allocations.length !== orderLines.length || !orderLines.length) {
      excludedOrders.push({ orderId: order.id, reason: "No priceable POS lines; recipe cost chain unavailable" });
      continue;
    }
    orderLines.forEach((line, i) => sold.push({ ...line, sellingPrice: line.price, lineRevenueInr: allocations[i] }));
  }
  const recipes = await db.select().from(bomRecipes).where(eq(bomRecipes.branchId, branchId));
  const result = computeFoodCost(sold, buildRecipeIndex(recipes), rates);
  const reason = excludedOrders.length ? "Completed orders have no priceable POS lines" : result.excludedCount ? "Sold items have incomplete recipes/vendor rates" : !orders.length ? "No completed sales in this period" : Number(result.revenueInr) <= 0 ? "No positive completed-sale revenue" : null;
  return { ...result, revenueInr: sumMoneyInr(orders.map((o) => o.totalAmount)), cogsInr: excludedOrders.length ? null : result.cogsInr, foodCostPercent: excludedOrders.length ? null : result.foodCostPercent, excludedOrders, reason, notes: [...result.notes, "Revenue is the completed invoice total (discounts and GST included), allocated proportionally across POS lines; current recipes/rates are estimates, not historical posted COGS."] };
}
export async function closingCash(scope: string | null, range?: { start: Date; end: Date }) {
  // Read the variance persisted by endShiftAndHandover, never recompute it.
  // Join the actual closing handover + ENDED run, not arbitrary off-cycle drops.
  return db.select({ cashDropId: cashDrops.id, branchId: shiftRuns.branchId, branchName: branches.name, cashierId: cashDrops.cashierId, cashierName: users.name, shiftRunId: shiftRuns.id, shiftDate: shiftRuns.startedAt, closedAt: shiftRuns.endedAt, label: shiftRuns.label, expectedCashInr: cashDrops.expectedCashInr, countedCashInr: cashDrops.countedCashInr, shortageExcessInr: cashDrops.shortageExcessInr })
    .from(shiftRuns).innerJoin(shiftHandovers, and(eq(shiftHandovers.fromRunId, shiftRuns.id), eq(shiftHandovers.branchId, shiftRuns.branchId)))
    .innerJoin(cashDrops, and(eq(cashDrops.id, shiftHandovers.closingCashDropId), eq(cashDrops.branchId, shiftRuns.branchId), eq(cashDrops.shiftRunId, shiftRuns.id)))
    .innerJoin(users, eq(users.id, cashDrops.cashierId)).innerJoin(branches, eq(branches.id, shiftRuns.branchId))
    .where(and(eq(shiftRuns.status, "ENDED"), scope ? eq(shiftRuns.branchId, scope) : undefined, range ? gte(shiftRuns.endedAt, range.start) : undefined, range ? lt(shiftRuns.endedAt, range.end) : undefined))
    .orderBy(desc(shiftRuns.endedAt), desc(shiftRuns.id));
}
