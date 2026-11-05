import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { inventoryStock, stockBatches } from "@/db/schema/inventory";
import { warehouseStock } from "@/db/schema/warehouse-stock";
import { creditLocatedBatch } from "@/lib/server/stock-batches";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, HttpError } from "@/lib/server/permissions";
import { fields, reconciliationLots, sumBatchQty } from "@/lib/server/batch-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/inventory/batches/reconcile — Owner-only. Allocates the EXACT
// existing unbatched difference (saved aggregate minus the sum of real
// remaining lots) into one or more real, Owner-attested lots. Never credits
// a single extra unit of stock — the lot total must equal the difference
// exactly (see batch-policy.ts's reconciliationLots), so this can never be
// used to fabricate new stock, only to retroactively classify stock that
// already existed before batch tracking covered this location.
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertOwner(actor);
      const input = await body(request);
      fields(input, ["branchId", "warehouseId", "rawMaterialId", "evidence", "lots"]);
      const branchId = typeof input.branchId === "string" ? input.branchId : null;
      const warehouseId = typeof input.warehouseId === "string" ? input.warehouseId : null;
      if (!!branchId === !!warehouseId) throw new HttpError(400, "Supply branchId XOR warehouseId");
      const rawMaterialId = input.rawMaterialId as string;
      if (typeof rawMaterialId !== "string" || !rawMaterialId) throw new HttpError(400, "Invalid rawMaterialId");

      let qtyOnHand: string;
      if (branchId) {
        const [row] = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.branchId, branchId), eq(inventoryStock.rawMaterialId, rawMaterialId))).limit(1).for("update");
        if (!row) throw new HttpError(404, "No saved stock for this branch+material");
        qtyOnHand = row.qtyOnHand;
      } else {
        const [row] = await tx.select().from(warehouseStock).where(and(eq(warehouseStock.warehouseId, warehouseId!), eq(warehouseStock.rawMaterialId, rawMaterialId))).limit(1).for("update");
        if (!row) throw new HttpError(404, "No saved stock for this warehouse+material");
        qtyOnHand = row.qtyOnHand;
      }

      const batchRows = await tx.select({ qtyRemaining: stockBatches.qtyRemaining }).from(stockBatches)
        .where(and(branchId ? eq(stockBatches.branchId, branchId) : eq(stockBatches.warehouseId, warehouseId!), eq(stockBatches.rawMaterialId, rawMaterialId)));
      const batchQty = sumBatchQty(batchRows);

      const lots = reconciliationLots(qtyOnHand, batchQty, input.lots, input.evidence);
      const sourceId = randomUUID();
      const created: string[] = [];
      for (const lot of lots) {
        const id = branchId
          ? await creditLocatedBatch(tx, { branchId }, rawMaterialId, lot.qty, lot, { actorId: actor.id, sourceType: "BATCH_RECONCILE", sourceId })
          : await creditLocatedBatch(tx, { warehouseId: warehouseId! }, rawMaterialId, lot.qty, lot, { actorId: actor.id, sourceType: "BATCH_RECONCILE", sourceId });
        if (id) created.push(id);
      }
      return { createdBatchIds: created, lots };
    });
    return json(result, 201);
  });
}
