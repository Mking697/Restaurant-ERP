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
  const rateByRaw = new Map<string, number>();
  for (const row of rateRows) if (!rateByRaw.has(row.rawMaterialId)) rateByRaw.set(row.rawMaterialId, Number(row.rate));
  let total = 0;
  for (const [rawId, qty] of rawTotals) {
    const rate = rateByRaw.get(rawId);
    if (rate === undefined) { complete = false; continue; }
    total += qty * rate;
  }
  return { cogsAmount: total.toFixed(2), complete };
}
