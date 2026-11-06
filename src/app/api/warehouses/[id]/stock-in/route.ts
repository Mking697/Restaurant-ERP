import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, assertOwner } from "@/lib/server/permissions";
import { assertCentralWarehouse, creditWarehouseStock } from "@/lib/server/warehouse-stock";
import { creditLocatedBatch } from "@/lib/server/stock-batches";
import { parseBatchInput, fields } from "@/lib/server/batch-policy";
import { rawMaterials } from "@/db/schema/menu";
import { warehouseStock } from "@/db/schema/warehouse-stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/warehouses/[id]/stock-in — GAP-004 follow-up slice, extended by
// GAP-006 to also record a real stockBatches lot (location {warehouseId})
// for this credit, alongside (not instead of) the flat warehouseStock
// aggregate — same dual aggregate/lot invariant inventory_stock/stockBatches
// already enforces for branches. A caller may supply batchNo/expiryDate for
// a real known lot; omitting both leaves the lot UNKNOWN (held, per the
// Owner's hard-block policy) rather than guessing a date. nonExpiring is
// Owner-only with mandatory evidence (see batch-policy.ts).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      // Nov 2026: this route's own comment always claimed "Owner/INVENTORY-
      // gated" but only ever checked the generic INVENTORY module — any
      // branch staff with that module (granted for their own branch's
      // normal stock work) could inject arbitrary central-warehouse stock
      // with zero vendor/invoice/PO trail. Now actually Owner-gated.
      assertOwner(actor);
      assertModule(actor, "INVENTORY");
      const { id } = await context.params;
      const input = await body(request);
      fields(input, ["rawMaterialId", "qty", "note", "batchNo", "expiryDate", "nonExpiring", "evidence"]);
      const rawMaterialId = (input.rawMaterialId as string | undefined) ?? "";
      if (typeof rawMaterialId !== "string" || !rawMaterialId) throw new Error("Invalid rawMaterialId");
      const qty = input.qty as string;
      const note = input.note === undefined || input.note === null ? "" : String(input.note).slice(0, 500);
      const batch = parseBatchInput(input, actor.role === "SUPER_ADMIN");

      const warehouse = await assertCentralWarehouse(tx, id);
      const [material] = await tx.select().from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId)).limit(1);
      if (!material) throw new Error("Raw material not found");

      await creditWarehouseStock(tx, id, rawMaterialId, qty);
      const sourceId = randomUUID();
      await creditLocatedBatch(tx, { warehouseId: id }, rawMaterialId, qty, batch, { actorId: actor.id, sourceType: "WAREHOUSE_STOCK_IN", sourceId });
      return { warehouseId: warehouse.id, rawMaterialId, qty, note, stockedById: actor.id };
    });
    return json(result, 201);
  });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "INVENTORY");
    const { id } = await context.params;
    const rows = await db.select().from(warehouseStock).where(eq(warehouseStock.warehouseId, id));
    return json({ warehouseStock: rows });
  });
}
