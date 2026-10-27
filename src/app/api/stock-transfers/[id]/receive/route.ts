import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { stockTransfers, warehouses } from "@/db/schema/warehouses";
import { inventoryStock } from "@/db/schema/inventory";
import { mutate } from "@/lib/server/auth";
import { api, body, json, numeric } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receiving is the ONLY place a stock transfer actually mutates real branch
// inventory — it adds qtyReceived to the destination branch's inventory_stock
// (creating the row if this is the branch's first stock of that raw material).
// qtyReceived may be less than qtyDispatched (damage/shortage in transit) —
// that variance is returned in the response for the branch to flag, same
// spirit as grnLines.qtyFailed in the vendor GRN flow; it is not enforced
// against anything yet (no automatic return/refund entry here).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const input = await body(request);
      const qtyReceived = numeric(input.qtyReceived, "qtyReceived");
      if (!(Number(qtyReceived) >= 0)) throw new HttpError(400, "qtyReceived must be zero or positive");

      const [transfer] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id)).limit(1);
      if (!transfer) throw new HttpError(404, "Stock transfer not found");
      if (transfer.status !== "DISPATCHED") throw new HttpError(409, "Transfer is not awaiting receipt");

      const [to] = await tx.select().from(warehouses).where(eq(warehouses.id, transfer.toWarehouseId)).limit(1);
      if (!to || !to.branchId) throw new HttpError(400, "Destination warehouse invalid");
      branchScope(actor, to.branchId);

      const [existingStock] = await tx
        .select()
        .from(inventoryStock)
        .where(and(eq(inventoryStock.branchId, to.branchId), eq(inventoryStock.rawMaterialId, transfer.rawMaterialId)))
        .limit(1);
      if (existingStock) {
        const newQty = (Number(existingStock.qtyOnHand) + Number(qtyReceived)).toFixed(3);
        await tx.update(inventoryStock).set({ qtyOnHand: newQty, updatedAt: new Date() }).where(eq(inventoryStock.id, existingStock.id));
      } else {
        await tx.insert(inventoryStock).values({ id: randomUUID(), branchId: to.branchId, rawMaterialId: transfer.rawMaterialId, qtyOnHand: qtyReceived });
      }

      await tx
        .update(stockTransfers)
        .set({ status: "RECEIVED", qtyReceived, receivedById: actor.id, receivedAt: new Date() })
        .where(eq(stockTransfers.id, id));
      const [updated] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id));
      const variance = (Number(transfer.qtyDispatched) - Number(qtyReceived)).toFixed(3);
      return { stockTransfer: updated, variance };
    });
    return json(result, 200);
  });
}
