import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryStock } from "@/db/schema/inventory";
import { rawMaterials } from "@/db/schema/menu";
import { branches } from "@/db/schema/platform";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, numeric, string } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const columns = { id: inventoryStock.id, branchId: inventoryStock.branchId, rawMaterialId: inventoryStock.rawMaterialId, name: rawMaterials.name, unit: rawMaterials.unit, category: rawMaterials.category, isHighValue: rawMaterials.isHighValue, qtyOnHand: inventoryStock.qtyOnHand, minStockLevel: inventoryStock.minStockLevel, maxStockLevel: inventoryStock.maxStockLevel, updatedAt: inventoryStock.updatedAt };
export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request); assertModule(actor, "INVENTORY"); const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
  const inventory = await db.select(columns).from(inventoryStock).innerJoin(rawMaterials, eq(rawMaterials.id, inventoryStock.rawMaterialId)).where(scope ? eq(inventoryStock.branchId, scope) : undefined).orderBy(rawMaterials.name);
  return json({ inventory });
}); }
export async function POST(request: Request) { return api(async () => {
  const inventory = await mutate(request, async (tx, actor) => {
    assertModule(actor, "INVENTORY"); const input = await body(request);
    const branchId = branchScope(actor, input.branchId === undefined ? undefined : string(input.branchId, "branchId"));
    if (!branchId) throw new HttpError(400, "Select a branch");
    if (!(await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1)).length) throw new HttpError(400, "Branch not found");
    const qtyOnHand = numeric(input.qtyOnHand, "qtyOnHand"), minStockLevel = numeric(input.minStockLevel, "minStockLevel"), maxStockLevel = numeric(input.maxStockLevel, "maxStockLevel");
    if (Number(maxStockLevel) > 0 && Number(maxStockLevel) < Number(minStockLevel)) throw new HttpError(400, "Max stock must be at least minimum stock");
    let rawMaterialId: string;
    if (input.rawMaterialId !== undefined) {
      rawMaterialId = string(input.rawMaterialId, "rawMaterialId");
      if (!(await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId)).limit(1)).length) throw new HttpError(400, "Material not found");
    } else {
      const name = string(input.name, "name"), unit = string(input.unit, "unit", 30);
      if (!["kg", "g", "ltr", "ml", "pcs", "box", "pack"].includes(unit)) throw new HttpError(400, "Invalid unit");
      // Catalog is global by existing schema; stock and par levels remain branch-local.
      // Reusing a catalog name never edits the shared catalog or another branch.
      const [existing] = await tx.select().from(rawMaterials).where(eq(rawMaterials.name, name)).limit(1);
      if (existing && existing.unit !== unit) throw new HttpError(409, "Material name already uses another unit");
      if (existing) rawMaterialId = existing.id;
      else { rawMaterialId = randomUUID(); await tx.insert(rawMaterials).values({ id: rawMaterialId, name, unit }); }
    }
    if ((await tx.select({ id: inventoryStock.id }).from(inventoryStock).where(and(eq(inventoryStock.branchId, branchId), eq(inventoryStock.rawMaterialId, rawMaterialId))).limit(1)).length) throw new HttpError(409, "Item already exists in this branch");
    const id = randomUUID(); await tx.insert(inventoryStock).values({ id, branchId, rawMaterialId, qtyOnHand, minStockLevel, maxStockLevel });
    const [row] = await tx.select(columns).from(inventoryStock).innerJoin(rawMaterials, eq(rawMaterials.id, inventoryStock.rawMaterialId)).where(eq(inventoryStock.id, id)); return row;
  }); return json({ item: inventory }, 201);
}); }
