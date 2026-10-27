import { and, eq, min } from "drizzle-orm";
import { db } from "@/db/client";
import { bomRecipes, menuItems, rawMaterials } from "@/db/schema/menu";
import { vendorRates } from "@/db/schema/vendors";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { buildRecipeIndex, computeRecipeCost, explodeBom, type BomRow } from "@/lib/server/bom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Explodes `qty` units of `menuItemId` down to raw-material requirements and
// an estimated recipe cost, recursing through any nested Semi-FG components.
// Cost uses the lowest active vendor rate per raw material as a planning
// estimate — NOT a locked costing policy and not wired into any real
// invoice/COGS posting yet (see the precision caveat in src/lib/server/bom.ts).
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "MENU_BOM");
    const url = new URL(request.url);
    const menuItemId = url.searchParams.get("menuItemId");
    if (!menuItemId) throw new HttpError(400, "menuItemId is required");
    const qtyParam = url.searchParams.get("qty") ?? "1";
    if (!/^\d{1,6}(\.\d{1,3})?$/.test(qtyParam) || !(Number(qtyParam) > 0)) throw new HttpError(400, "Invalid qty");
    const qty = Number(qtyParam);

    const [item] = await db.select({ branchId: menuItems.branchId }).from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
    if (!item) throw new HttpError(404, "Menu item not found");
    const branchId = branchScope(actor, item.branchId);
    if (!branchId) throw new HttpError(400, "Select a branch");

    const rows = (await db
      .select({
        id: bomRecipes.id,
        branchId: bomRecipes.branchId,
        menuItemId: bomRecipes.menuItemId,
        componentType: bomRecipes.componentType,
        rawMaterialId: bomRecipes.rawMaterialId,
        componentMenuItemId: bomRecipes.componentMenuItemId,
        qtyPerUnit: bomRecipes.qtyPerUnit,
        lockedByHq: bomRecipes.lockedByHq,
      })
      .from(bomRecipes)
      .where(eq(bomRecipes.branchId, branchId))) as BomRow[];
    const index = buildRecipeIndex(rows);

    const requirements = explodeBom(menuItemId, qty, index);
    const rawMaterialIds = [...requirements.keys()];
    // Fetch names/units for every required raw material (small N, simple loop keeps this readable).
    const materialRows = rawMaterialIds.length
      ? await Promise.all(rawMaterialIds.map((id) => db.select({ id: rawMaterials.id, name: rawMaterials.name, unit: rawMaterials.unit }).from(rawMaterials).where(eq(rawMaterials.id, id)).then((r) => r[0])))
      : [];

    const rateRows = rawMaterialIds.length
      ? await db
          .select({ rawMaterialId: vendorRates.rawMaterialId, rate: min(vendorRates.rate) })
          .from(vendorRates)
          .where(and(eq(vendorRates.isActive, true)))
          .groupBy(vendorRates.rawMaterialId)
      : [];
    const rateMap = new Map(rateRows.filter((r) => rawMaterialIds.includes(r.rawMaterialId)).map((r) => [r.rawMaterialId, Number(r.rate)]));

    const requirementList = materialRows.filter(Boolean).map((material) => ({
      rawMaterialId: material!.id,
      name: material!.name,
      unit: material!.unit,
      qty: Math.round((requirements.get(material!.id) ?? 0) * 1000) / 1000,
      rateAvailable: rateMap.has(material!.id),
    }));

    let estimatedCost: number | null = null;
    let costNote = "Vendor rate missing for at least one required raw material; cost estimate unavailable.";
    if (rawMaterialIds.every((id) => rateMap.has(id))) {
      estimatedCost = Math.round(computeRecipeCost(menuItemId, index, rateMap) * qty * 100) / 100;
      costNote = "Estimated from the lowest active vendor rate per raw material — a planning estimate, not a locked costing policy.";
    }

    return json({ menuItemId, qty, requirements: requirementList, estimatedCost, costNote });
  });
}
