import { desc, eq, inArray } from "drizzle-orm";
import { bomRecipes } from "../../db/schema/menu";
import { vendorRates } from "../../db/schema/vendors";
import type { Executor } from "./auth";
import { buildRecipeIndex, explodeBom, type BomRow } from "./bom";
import { HttpError } from "./permissions";

// ---------------------------------------------------------------------------
// Real COGS, captured ONCE at POS order-confirm time (src/app/api/pos/orders/
// route.ts) and persisted on pos_orders — never recomputed retroactively,
// unlike Reports > Food Cost (src/app/api/reports/_aggregation.ts) which
// restates a PAST period's cost using TODAY's rates as an explicit estimate.
//
// Reuses the same recursive BOM-explode engine (src/lib/server/bom.ts) Food
// Cost / bom-recipes/explode already use, but sources each raw material's
// cost from the LATEST locked vendor rate (same "actual cost incurred"
// convention Inventory valuation uses — src/app/api/reports/_data.ts's
// inventoryRates), not the lowest-active PLANNING rate Food Cost uses.
//
// Every menuItemId passed in is guaranteed to already have a top-level
// bom_recipes row by the time this runs (the POS order route already calls
// directRequirements, which throws 409 before this point if any sold dish
// has no saved recipe at all). The only incompleteness this function can
// find is deeper in the tree: a nested Semi-FG with no saved recipe, or a
// raw material with no vendor rate EVER locked. In that case `complete` is
// false and `cogsAmount` is only the partial sum of whatever WAS priceable
// — the caller must never present that partial sum as the order's real
// cost (see pos_orders.cogsComplete comment).
// ---------------------------------------------------------------------------

export interface OrderCogsLine { menuItemId: string; qty: number }
export interface OrderCogsResult { cogsAmount: string; complete: boolean }

// Fixed-point paise-BigInt money helpers — same convention as the rest of
// this project's real money code (expenses.ts/accounts-ledger.ts/vat.ts/
// reports/_aggregation.ts's toPaise/fromPaise). Each raw material's cost
// (qty-from-BOM-explode [float, inherent to bom.ts's explosion engine] times
// vendor rate) is rounded to paise ONCE per raw material, then every
// subsequent sum is exact BigInt — never a running float accumulator that
// could drift across many order lines/raw materials.
function toPaise(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new HttpError(500, "Invalid persisted money value");
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = raw.split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -amount : amount;
}
function fromPaise(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

export async function computeOrderCogs(tx: Executor, branchId: string, lines: OrderCogsLine[]): Promise<OrderCogsResult> {
  const recipeRows = await tx.select().from(bomRecipes).where(eq(bomRecipes.branchId, branchId));
  const recipeIndex = buildRecipeIndex(recipeRows as BomRow[]);
  let complete = true;
  const rawTotals = new Map<string, number>();
  for (const line of lines) {
    // Same incompleteness check Food Cost uses: explodeBom silently treats
    // an empty nested recipe as "no leaves", so walk the Semi-FG chain
    // ourselves first and flag anything missing before trusting the explode.
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const components = recipeIndex.get(id);
      if (!components?.length) { complete = false; return; }
      for (const row of components) if (row.componentType === "SEMI_FG" && row.componentMenuItemId) visit(row.componentMenuItemId);
    };
    visit(line.menuItemId);
    let exploded: Map<string, number>;
    try {
      exploded = explodeBom(line.menuItemId, line.qty, recipeIndex);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      complete = false;
      continue;
    }
    for (const [rawId, qty] of exploded) rawTotals.set(rawId, (rawTotals.get(rawId) ?? 0) + qty);
  }
  if (!rawTotals.size) return { cogsAmount: "0.00", complete };
  const rawIds = [...rawTotals.keys()];
  const rateRows = await tx.select().from(vendorRates).where(inArray(vendorRates.rawMaterialId, rawIds)).orderBy(desc(vendorRates.lockedAt), desc(vendorRates.id));
  const rateByRaw = new Map<string, string>();
  for (const row of rateRows) if (!rateByRaw.has(row.rawMaterialId)) rateByRaw.set(row.rawMaterialId, row.rate);
  let totalPaise = 0n;
  for (const [rawId, qty] of rawTotals) {
    const rate = rateByRaw.get(rawId);
    if (rate === undefined) { complete = false; continue; }
    // qty is float (inherent to explodeBom); rate is an exact persisted paise
    // amount. Round the product to paise once, right here, then fold it into
    // the exact BigInt running total — never let a float total accumulate.
    const ratePaise = toPaise(rate);
    const lineCostPaise = BigInt(Math.round(qty * Number(ratePaise)));
    totalPaise += lineCostPaise;
  }
  return { cogsAmount: fromPaise(totalPaise), complete };
}
