import { HttpError } from "../../../lib/server/permissions";
import { buildRecipeIndex, computeRecipeCost, explodeBom, type BomRow } from "../../../lib/server/bom";

// ---------------------------------------------------------------------------
// Dashboard KPIs + Reports (sales-trend, food-cost, cash-reconciliation) —
// pure/shared aggregation helpers, unit-tested in isolation from HTTP/DB.
// Never fabricate a number: every "cannot compute from real data" path
// returns null + an explicit reason field, matching this project's
// established convention (see accounts-ledger.ts's seeded:false pattern).
// This file only READS mis_scores (written exclusively by 3a's MIS engine)
// and reuses operationalOrderVisibility()/shift cash-drop rows/BOM explode —
// it never recomputes MIS scores, cash variance, or recipe cost logic itself.
// ---------------------------------------------------------------------------

// -- IST calendar-day/month helpers (fixed UTC+5:30, no DST) ----------------

export function istDateParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d };
}
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export function istDayRange(now: Date = new Date()) {
  const { y, m, d } = istDateParts(now);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
export function istMonthRange(now: Date = new Date()) {
  const { y, m } = istDateParts(now);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0) - IST_OFFSET_MS);
  return { start, end };
}
export function istDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); // yyyy-mm-dd
}
export function istDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" }).format(date);
}

// -- Fixed-point INR money helpers (same paise-BigInt convention as the rest
// of this project's money code — expenses.ts/accounts-ledger.ts/vat.ts) ----

export function toPaise(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new HttpError(500, "Invalid persisted money value");
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = raw.split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -amount : amount;
}
export function fromPaise(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export function sumMoneyInr(values: string[]): string {
  return fromPaise(values.reduce((sum, v) => sum + toPaise(v), 0n));
}

export function postedFoodCost(orders: { totalAmount: string; cogsAmount: string | null; cogsComplete: boolean }[]) {
  if (!orders.length || orders.some((order) => order.cogsComplete !== true || order.cogsAmount === null)) {
    return { actualCogsInr: null, actualFoodCostPercent: null, actualReason: orders.length ? "Some completed orders lack complete posted ingredient cost" : "No completed sales in this period" };
  }
  const cost = orders.reduce((sum, order) => sum + toPaise(order.cogsAmount!), 0n);
  const revenue = orders.reduce((sum, order) => sum + toPaise(order.totalAmount), 0n);
  // Percentage to two decimals, half-up, with no money converted to Number.
  const percent = revenue > 0n ? (cost * 10000n + revenue / 2n) / revenue : null;
  return { actualCogsInr: fromPaise(cost), actualFoodCostPercent: percent === null ? null : fromPaise(percent), actualReason: revenue > 0n ? null : "No positive completed-sale revenue" };
}

export function allocateSaleRevenue(total: string, lines: { price: string; qty: number }[]): string[] {
  const weights = lines.map((l) => toPaise(l.price) * BigInt(l.qty));
  const denominator = weights.reduce((s, v) => s + v, 0n);
  if (denominator <= 0n) return [];
  const amount = toPaise(total);
  let allocated = 0n;
  return weights.map((weight, i) => {
    const part = i === weights.length - 1 ? amount - allocated : amount * weight / denominator;
    allocated += part;
    return fromPaise(part);
  });
}

// -- Days query param --------------------------------------------------------

export function parseDaysParam(value: string | null, fallback = 14, max = 90): number {
  if (value === null || value === "") return fallback;
  if (!/^\d{1,3}$/.test(value)) throw new HttpError(400, "Invalid days");
  const days = Number(value);
  if (days < 1 || days > max) throw new HttpError(400, `days must be between 1 and ${max}`);
  return days;
}

// -- Sales trend day-grouping -------------------------------------------------

export interface DailyRevenueBucket { date: string; label: string; revenueInr: string; orderCount: number }

/** Builds `days` consecutive IST calendar-day buckets ending today (today
 * last), each pre-seeded to zero so a day with zero completed sales is a
 * real reported zero, never a missing/skipped row. */
export function groupRevenueByDay(orders: { createdAt: Date; totalAmount: string }[], days: number, now: Date = new Date()): DailyRevenueBucket[] {
  const buckets = new Map<string, DailyRevenueBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = istDayKey(d);
    buckets.set(key, { date: key, label: istDayLabel(d), revenueInr: "0.00", orderCount: 0 });
  }
  for (const order of orders) {
    const key = istDayKey(order.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the requested window
    bucket.revenueInr = sumMoneyInr([bucket.revenueInr, order.totalAmount]);
    bucket.orderCount += 1;
  }
  return [...buckets.values()];
}

// -- Inventory value (never fabricate a rate) --------------------------------

export interface InventoryValueResult { totalInventoryValueInr: number; ratesMissingForCount: number; materialsMissingRateIds: string[] }

export function computeInventoryValue(stockRows: { rawMaterialId: string; qtyOnHand: string }[], rateMap: Map<string, number>): InventoryValueResult {
  let total = 0;
  const missing: string[] = [];
  for (const row of stockRows) {
    const rate = rateMap.get(row.rawMaterialId);
    if (rate === undefined) { missing.push(row.rawMaterialId); continue; }
    total += Number(row.qtyOnHand) * rate;
  }
  return { totalInventoryValueInr: Math.round(total * 100) / 100, ratesMissingForCount: new Set(missing).size, materialsMissingRateIds: [...new Set(missing)] };
}

// -- Open overdue tasks -------------------------------------------------------

export function isTaskOverdue(task: { status: string; dueAt: Date }, now: Date = new Date()): boolean {
  if (task.status === "OVERDUE") return true;
  return task.dueAt.getTime() < now.getTime() && task.status !== "DONE" && task.status !== "SKIPPED";
}

// -- Food cost (BOM-explode, reusing src/lib/server/bom.ts — never a second
// costing implementation) ----------------------------------------------------

export interface SoldLine { menuItemId: string; menuItemName: string; sellingPrice: string; qty: number; lineRevenueInr: string }
export interface FoodCostItemRow {
  menuItemId: string; name: string; qtySold: number; revenueInr: string;
  bomCostPerUnit: number | null; lineCogsInr: string | null; foodCostPercent: number | null;
  excluded: boolean; exclusionReason?: string;
}
export interface FoodCostResult {
  revenueInr: string; cogsInr: string | null; foodCostPercent: number | null;
  items: FoodCostItemRow[]; excludedCount: number;
  excludedMenuItems: { menuItemId: string; name: string; reason: string }[];
  notes: string[];
}

/** Aggregates sold lines per menu item, then prices each item via the
 * existing BOM-explode recipe tree + lowest-active-vendor-rate map (same
 * helpers src/app/api/bom-recipes/explode/route.ts uses — no new costing
 * logic). Any item with no recipe row or a raw material missing a vendor
 * rate is EXCLUDED from the COGS sum and listed explicitly — the overall
 * foodCostPercent is then null (an incomplete sum would understate cost),
 * never silently reported as if it were complete. */
export function computeFoodCost(soldLines: SoldLine[], recipeIndex: Map<string, BomRow[]>, rateMap: Map<string, number>): FoodCostResult {
  const byItem = new Map<string, { menuItemId: string; name: string; qtySold: number; revenueInr: string }>();
  for (const line of soldLines) {
    const existing = byItem.get(line.menuItemId);
    if (existing) { existing.qtySold += line.qty; existing.revenueInr = sumMoneyInr([existing.revenueInr, line.lineRevenueInr]); }
    else byItem.set(line.menuItemId, { menuItemId: line.menuItemId, name: line.menuItemName, qtySold: line.qty, revenueInr: line.lineRevenueInr });
  }
  const items: FoodCostItemRow[] = [];
  const excludedMenuItems: { menuItemId: string; name: string; reason: string }[] = [];
  let cogsPaise = 0n;
  let anyExcluded = false;
  for (const item of byItem.values()) {
    const rows = recipeIndex.get(item.menuItemId) ?? [];
    if (!rows.length) {
      items.push({ menuItemId: item.menuItemId, name: item.name, qtySold: item.qtySold, revenueInr: item.revenueInr, bomCostPerUnit: null, lineCogsInr: null, foodCostPercent: null, excluded: true, exclusionReason: "No recipe (BOM) saved for this menu item" });
      excludedMenuItems.push({ menuItemId: item.menuItemId, name: item.name, reason: "No recipe (BOM) saved" });
      anyExcluded = true;
      continue;
    }
    let requiredRawIds: string[] = [];
    let invalidReason: string | null = null;
    try {
      // explodeBom deliberately treats an empty nested recipe as no leaves;
      // reports must reject that incomplete chain rather than price it at 0.
      const seen = new Set<string>();
      const visit = (id: string) => {
        if (seen.has(id)) return; // explodeBom below owns cycle/depth validation
        seen.add(id);
        const components = recipeIndex.get(id);
        if (!components?.length) throw new HttpError(409, `No recipe saved for component ${id}`);
        for (const row of components) if (row.componentType === "SEMI_FG" && row.componentMenuItemId) visit(row.componentMenuItemId);
      };
      visit(item.menuItemId);
      requiredRawIds = [...explodeBom(item.menuItemId, 1, recipeIndex).keys()];
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      invalidReason = error.message;
    }
    const missingRates = requiredRawIds.filter((id) => !rateMap.has(id));
    const exclusionReason = invalidReason ?? (missingRates.length ? `Vendor rate missing for raw material(s): ${missingRates.join(", ")}` : null);
    if (exclusionReason) {
      items.push({ menuItemId: item.menuItemId, name: item.name, qtySold: item.qtySold, revenueInr: item.revenueInr, bomCostPerUnit: null, lineCogsInr: null, foodCostPercent: null, excluded: true, exclusionReason });
      excludedMenuItems.push({ menuItemId: item.menuItemId, name: item.name, reason: exclusionReason });
      anyExcluded = true;
      continue;
    }
    const unitCost = computeRecipeCost(item.menuItemId, recipeIndex, rateMap);
    const lineCogsInr = (Math.round(unitCost * item.qtySold * 100) / 100).toFixed(2);
    cogsPaise += toPaise(lineCogsInr);
    const revenueNum = Number(item.revenueInr);
    items.push({ menuItemId: item.menuItemId, name: item.name, qtySold: item.qtySold, revenueInr: item.revenueInr, bomCostPerUnit: unitCost, lineCogsInr, foodCostPercent: revenueNum > 0 ? Math.round((Number(lineCogsInr) / revenueNum) * 1000) / 10 : null, excluded: false });
  }
  const revenueInr = sumMoneyInr(items.map((i) => i.revenueInr));
  const notes = ["COGS uses the lowest active vendor rate per raw material via the existing BOM-explode engine (src/lib/server/bom.ts) — the same planning-estimate costing bom-recipes/explode uses, not a locked invoice cost."];
  if (anyExcluded) {
    notes.push("One or more sold menu items were excluded from the COGS sum (missing recipe or vendor rate) — see excludedMenuItems. Overall foodCostPercent is null rather than an understated figure.");
    return { revenueInr, cogsInr: null, foodCostPercent: null, items, excludedCount: excludedMenuItems.length, excludedMenuItems, notes };
  }
  const cogsInr = fromPaise(cogsPaise);
  const revenueNum = Number(revenueInr);
  const foodCostPercent = revenueNum > 0 ? Math.round((Number(cogsInr) / revenueNum) * 1000) / 10 : null;
  if (revenueNum === 0) notes.push("No completed sales revenue in this period — foodCostPercent is null, not a fabricated 0%.");
  return { revenueInr, cogsInr, foodCostPercent, items, excludedCount: 0, excludedMenuItems: [], notes };
}

// -- Cash reconciliation (reuse shift/cash-drop rows, no new variance math) --

export function cashReconSummary(rows: { shortageExcessInr: string }[]) {
  const nonZero = rows.filter((r) => Number(r.shortageExcessInr) !== 0).length;
  return { totalRows: rows.length, nonZeroVarianceCount: nonZero, totalShortageExcessInr: sumMoneyInr(rows.map((r) => r.shortageExcessInr)) };
}

export type { BomRow };
export { buildRecipeIndex };
