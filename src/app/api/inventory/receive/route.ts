import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryStock } from "@/db/schema/inventory";
import { rawMaterials } from "@/db/schema/menu";
import { branches } from "@/db/schema/platform";
import { mutate } from "@/lib/server/auth";
import { api, body, json, numeric, string } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = {
  id: inventoryStock.id,
  branchId: inventoryStock.branchId,
  rawMaterialId: inventoryStock.rawMaterialId,
  name: rawMaterials.name,
  unit: rawMaterials.unit,
  qtyOnHand: inventoryStock.qtyOnHand,
  minStockLevel: inventoryStock.minStockLevel,
  maxStockLevel: inventoryStock.maxStockLevel,
};

// Real GRN-quality-pass -> Inventory posting. Closes the previously known gap
// where GRN PASS/PARTIAL only updated page-local mock state and never moved
// a real quantity into inventory_stock. Increments existing stock atomically
// under the same xact lock every other mutation uses; creates the branch's
// stock row (min/max 0 = "not configured yet") if this is the first receipt
// of that material at that branch. This route never DECREASES stock and
// never touches min/max par levels — those stay whatever Inventory set them to.
export async function POST(request: Request) {
  return api(async () => {
    const row = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const input = await body(request);
      const branchId = branchScope(actor, string(input.branchId, "branchId"));
      if (!branchId) throw new HttpError(400, "Select a branch");
      if (!(await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1)).length) {
        throw new HttpError(400, "Branch not found");
      }
      const rawMaterialId = string(input.rawMaterialId, "rawMaterialId");
      if (!(await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId)).limit(1)).length) {
        throw new HttpError(400, "Material not found");
      }
      const qty = numeric(input.qty, "qty");
      if (Number(qty) <= 0) throw new HttpError(400, "Received quantity must be greater than zero");

      const [existing] = await tx
        .select({ id: inventoryStock.id })
        .from(inventoryStock)
        .where(and(eq(inventoryStock.branchId, branchId), eq(inventoryStock.rawMaterialId, rawMaterialId)))
        .limit(1);

      const id = existing ? existing.id : randomUUID();
      if (existing) {
        await tx
          .update(inventoryStock)
          .set({ qtyOnHand: sql`${inventoryStock.qtyOnHand} + ${qty}::numeric`, updatedAt: new Date() })
          .where(eq(inventoryStock.id, id));
      } else {
        await tx.insert(inventoryStock).values({ id, branchId, rawMaterialId, qtyOnHand: qty, minStockLevel: "0", maxStockLevel: "0" });
      }
      const [updated] = await tx
        .select(columns)
        .from(inventoryStock)
        .innerJoin(rawMaterials, eq(rawMaterials.id, inventoryStock.rawMaterialId))
        .where(eq(inventoryStock.id, id));
      return updated;
    });
    return json({ item: row }, 200);
  });
}
