import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { stockTransfers, warehouses } from "@/db/schema/warehouses";
import { inventoryStock } from "@/db/schema/inventory";
import { batchTransferAllocations, batchTransferReceipts, batchTransferReceiptLines } from "@/db/schema/batch-audit";
import { mutate } from "@/lib/server/auth";
import { api, body, json, canonicalJson } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { decimal, MAX_QUANTITY, quantity } from "@/lib/server/production-quantity";
import { creditLocatedBatch } from "@/lib/server/stock-batches";
import { transferReceiptInput } from "@/lib/server/batch-policy";
import { postCentralStockReceiveJournal } from "@/lib/server/accounts-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receiving is the ONLY place a stock transfer actually mutates real branch
// inventory. GAP-006: receipt now preserves the ORIGINAL dispatched lot
// identity (batchNo/expiryDate/expiryStatus, see batchTransferAllocations —
// written by the dispatch side in ../../route.ts) rather than crediting one
// fabricated "unknown origin" batch. A multi-lot dispatch with a real
// shortfall (received < dispatched) REQUIRES an explicit per-lot
// `allocations` breakdown — an aggregate-only qtyReceived is ambiguous about
// which lot actually came up short, so it is rejected (see
// transferReceiptInput). A single-lot dispatch, or a full-qty multi-lot
// receipt, may omit `allocations` for backward compatibility.
// Idempotent: a retry with the EXACT same request replays the stored result
// without a second credit; a different request against an already-received
// transfer is rejected (batchTransferReceipts has a UNIQUE transferId).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const input = await body(request);

      const [transfer] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id)).limit(1);
      if (!transfer) throw new HttpError(404, "Stock transfer not found");

      const [to] = await tx.select().from(warehouses).where(eq(warehouses.id, transfer.toWarehouseId)).limit(1);
      if (!to || !to.branchId) throw new HttpError(400, "Destination warehouse invalid");
      branchScope(actor, to.branchId);
      const [from] = await tx.select().from(warehouses).where(eq(warehouses.id, transfer.fromWarehouseId)).limit(1);

      const [existingReceipt] = await tx.select().from(batchTransferReceipts).where(eq(batchTransferReceipts.transferId, id)).limit(1);
      if (existingReceipt) {
        if (canonicalJson(existingReceipt.request) !== canonicalJson(input)) throw new HttpError(409, "Transfer already received with a different request; reconciliation required");
        const [updated] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id));
        const difference = quantity(transfer.qtyDispatched) - quantity(updated.qtyReceived ?? "0", true);
        const variance = difference < 0n ? `-${decimal(-difference)}` : decimal(difference);
        return { stockTransfer: updated, variance, replayed: true };
      }
      if (transfer.status !== "DISPATCHED") throw new HttpError(409, "Transfer is not awaiting receipt");

      const allocations = await tx.select().from(batchTransferAllocations).where(eq(batchTransferAllocations.transferId, id));
      const parsed = transferReceiptInput(input, allocations.map((a) => ({ id: a.id, qtyDispatched: a.qtyDispatched })));
      const receivedTotal = quantity(parsed.qtyReceived, true);

      const stockRows = await tx
        .select()
        .from(inventoryStock)
        .where(and(eq(inventoryStock.branchId, to.branchId), eq(inventoryStock.rawMaterialId, transfer.rawMaterialId)))
        .limit(2).for("update");
      if (stockRows.length > 1) throw new HttpError(409, "Duplicate raw stock rows; reconcile inventory first");
      const [existingStock] = stockRows;
      if (existingStock) {
        const newQty = quantity(existingStock.qtyOnHand, true) + receivedTotal;
        if (newQty > MAX_QUANTITY) throw new HttpError(409, "Inventory stock capacity exceeded");
        await tx.update(inventoryStock).set({ qtyOnHand: decimal(newQty), updatedAt: new Date() }).where(eq(inventoryStock.id, existingStock.id));
      } else if (receivedTotal > 0n) {
        await tx.insert(inventoryStock).values({ id: randomUUID(), branchId: to.branchId, rawMaterialId: transfer.rawMaterialId, qtyOnHand: decimal(receivedTotal) });
      }

      const allocationById = new Map(allocations.map((a) => [a.id, a]));
      const receiptId = randomUUID();
      await tx.insert(batchTransferReceipts).values({ id: receiptId, transferId: id, actorId: actor.id, request: input });
      // Nov 2026 (Owner-requested): accumulate the accepted value for the
      // Central-purchase GL posting below, exact bigint math (qty scale 3
      // x unitCostTsh scale 4, summed before rounding once at the end —
      // same discipline as computeGeneralPurchaseValueTsh elsewhere).
      let acceptedValueNumerator = 0n;
      for (const line of parsed.allocations) {
        const allocation = allocationById.get(line.allocationId)!;
        await tx.insert(batchTransferReceiptLines).values({ id: randomUUID(), receiptId, allocationId: line.allocationId, qtyReceived: line.qtyReceived });
        // Preserve the ORIGINAL dispatched lot identity on the destination
        // branch — never "unknown origin" when a real lot is known.
        if (quantity(line.qtyReceived, true) > 0n) {
          await creditLocatedBatch(tx, { branchId: to.branchId }, transfer.rawMaterialId, line.qtyReceived, { batchNo: allocation.batchNo, expiryDate: allocation.expiryDate, expiryStatus: allocation.expiryStatus, evidence: "" }, { actorId: actor.id, sourceType: "TRANSFER_RECEIVE", sourceId: id }, { originBatchId: allocation.originBatchId, unitCostTsh: allocation.unitCostTsh });
          if (allocation.unitCostTsh) {
            const [whole, fraction = ""] = allocation.unitCostTsh.split(".");
            const costScale4 = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0").slice(0, 4));
            acceptedValueNumerator += quantity(line.qtyReceived, true) * costScale4;
          }
        }
      }

      await tx
        .update(stockTransfers)
        .set({ status: "RECEIVED", qtyReceived: parsed.qtyReceived, receivedById: actor.id, receivedAt: new Date() })
        .where(eq(stockTransfers.id, id));
      if (from?.type === "CENTRAL" && acceptedValueNumerator > 0n) {
        const valueCenti = (acceptedValueNumerator + 50000n) / 100000n;
        const acceptedValueTsh = `${valueCenti / 100n}.${(valueCenti % 100n).toString().padStart(2, "0")}`;
        await postCentralStockReceiveJournal(tx, actor, { id, branchId: to.branchId }, acceptedValueTsh);
      }
      const [updated] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id));
      const difference = quantity(transfer.qtyDispatched) - receivedTotal;
      const variance = difference < 0n ? `-${decimal(-difference)}` : decimal(difference);
      return { stockTransfer: updated, variance, replayed: false };
    });
    return json(result, 200);
  });
}
