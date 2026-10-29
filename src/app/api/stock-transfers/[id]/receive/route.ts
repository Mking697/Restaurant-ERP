import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { stockTransfers, warehouses } from "@/db/schema/warehouses";
import { inventoryStock } from "@/db/schema/inventory";
import { mutate } from "@/lib/server/auth";
import { api, body, json, numeric } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { decimal, MAX_QUANTITY, quantity } from "@/lib/server/production-quantity";

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
      if (Object.keys(input).some(key => key !== "qtyReceived")) throw new HttpError(400, "Unknown receipt field");
      if (input.qtyReceived === undefined) throw new HttpError(400, "qtyReceived is required");
      const qtyReceived = numeric(input.qtyReceived, "qtyReceived");
      const received = quantity(qtyReceived, true);

      const [transfer] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id)).limit(1);
      if (!transfer) throw new HttpError(404, "Stock transfer not found");
      if (transfer.status !== "DISPATCHED") throw new HttpError(409, "Transfer is not awaiting receipt");

      const [to] = await tx.select().from(warehouses).where(eq(warehouses.id, transfer.toWarehouseId)).limit(1);
      if (!to || !to.branchId) throw new HttpError(400, "Destination warehouse invalid");
      branchScope(actor, to.branchId);

      const stockRows = await tx
        .select()
        .from(inventoryStock)
        .where(and(eq(inventoryStock.branchId, to.branchId), eq(inventoryStock.rawMaterialId, transfer.rawMaterialId)))
        .limit(2).for("update");
      if (stockRows.length > 1) throw new HttpError(409, "Duplicate raw stock rows; reconcile inventory first");
      const [existingStock] = stockRows;
      if (existingStock) {
        const newQty = quantity(existingStock.qtyOnHand, true) + received;
        if (newQty > MAX_QUANTITY) throw new HttpError(409, "Inventory stock capacity exceeded");
        await tx.update(inventoryStock).set({ qtyOnHand: decimal(newQty), updatedAt: new Date() }).where(eq(inventoryStock.id, existingStock.id));
      } else {
        await tx.insert(inventoryStock).values({ id: randomUUID(), branchId: to.branchId, rawMaterialId: transfer.rawMaterialId, qtyOnHand: qtyReceived });
      }

      await tx
        .update(stockTransfers)
        .set({ status: "RECEIVED", qtyReceived, receivedById: actor.id, receivedAt: new Date() })
        .where(eq(stockTransfers.id, id));
      const [updated] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id));
      const difference = quantity(transfer.qtyDispatched) - received;
      const variance = difference < 0n ? `-${decimal(-difference)}` : decimal(difference);
      return { stockTransfer: updated, variance };
    });
    return json(result, 200);
  });
}
