import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { stockTransfers, warehouses } from "@/db/schema/warehouses";
import { rawMaterials } from "@/db/schema/menu";
import { batchTransferAllocations } from "@/db/schema/batch-audit";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, numeric, string } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { debitWarehouseStock } from "@/lib/server/warehouse-stock";
import { allocateLocatedConsume } from "@/lib/server/stock-batches";
import { assertRequisitionLineFulfillable } from "@/lib/server/requisitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Central-to-branch stock movement, dispatch-then-receive verified the same
// way a vendor GRN is (see purchase.ts's three-way match). This pass only
// supports CENTRAL -> BRANCH transfers (not branch-to-branch) — keeps the
// inventory-mutation side unambiguous (only one branch's inventory_stock is
// ever touched, on receive — see [id]/receive/route.ts). GAP-004 follow-up
// slice: dispatch atomically debits the source CENTRAL warehouse's flat
// tracked balance (src/db/schema/warehouse-stock.ts). GAP-006 follow-up:
// dispatch now ALSO FEFO-allocates from the warehouse's real stockBatches
// lots (allowExpired: false — a transfer is real consumption leaving the
// warehouse, same hard-block as production/POS), and records one
// batchTransferAllocations row per source lot actually drawn from —
// preserving that lot's real batchNo/expiryDate/expiryStatus so receipt can
// credit the destination branch with the SAME lot identity, not a fabricated
// "unknown origin" batch. Both debits (flat balance + lot allocation) must
// agree, or the whole transaction rolls back — same reconciliation
// invariant this GAP already enforces for every other location's stock.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "INVENTORY");
    const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const rows = scope
      ? await db
          .select({ id: stockTransfers.id, fromWarehouseId: stockTransfers.fromWarehouseId, toWarehouseId: stockTransfers.toWarehouseId, rawMaterialId: stockTransfers.rawMaterialId, qtyDispatched: stockTransfers.qtyDispatched, qtyReceived: stockTransfers.qtyReceived, status: stockTransfers.status, dispatchedAt: stockTransfers.dispatchedAt, receivedAt: stockTransfers.receivedAt })
          .from(stockTransfers)
          .innerJoin(warehouses, eq(warehouses.id, stockTransfers.toWarehouseId))
          .where(eq(warehouses.branchId, scope))
          .orderBy(desc(stockTransfers.dispatchedAt))
          .limit(200)
      : await db.select().from(stockTransfers).orderBy(desc(stockTransfers.dispatchedAt)).limit(200);
    if (!rows.length) return json({ stockTransfers: [] });
    const allocationRows = await db.select().from(batchTransferAllocations).where(inArray(batchTransferAllocations.transferId, rows.map((r) => r.id)));
    const byTransfer = new Map<string, typeof allocationRows>();
    for (const a of allocationRows) {
      if (!byTransfer.has(a.transferId)) byTransfer.set(a.transferId, []);
      byTransfer.get(a.transferId)!.push(a);
    }
    return json({ stockTransfers: rows.map((row) => ({ ...row, allocations: (byTransfer.get(row.id) ?? []).map((a) => ({ id: a.id, batchNo: a.batchNo, expiryDate: a.expiryDate, expiryStatus: a.expiryStatus, qtyDispatched: a.qtyDispatched, unitCostTsh: a.unitCostTsh })) })) });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const transfer = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const input = await body(request);
      const fromWarehouseId = string(input.fromWarehouseId, "fromWarehouseId");
      const toWarehouseId = string(input.toWarehouseId, "toWarehouseId");
      if (fromWarehouseId === toWarehouseId) throw new HttpError(400, "Source and destination warehouse must differ");
      const rawMaterialId = string(input.rawMaterialId, "rawMaterialId");
      const qtyDispatched = numeric(input.qtyDispatched, "qtyDispatched");
      if (!(Number(qtyDispatched) > 0)) throw new HttpError(400, "qtyDispatched must be positive");

      const [from] = await tx.select().from(warehouses).where(eq(warehouses.id, fromWarehouseId)).limit(1);
      const [to] = await tx.select().from(warehouses).where(eq(warehouses.id, toWarehouseId)).limit(1);
      if (!from) throw new HttpError(400, "Source warehouse not found");
      if (!to) throw new HttpError(400, "Destination warehouse not found");
      if (from.type !== "CENTRAL") throw new HttpError(400, "Source must be a CENTRAL warehouse (branch-to-branch not supported yet)");
      if (to.type !== "BRANCH" || !to.branchId) throw new HttpError(400, "Destination must be a BRANCH warehouse");
      // Owner can dispatch to any branch; a branch-scoped user can only pull into their own branch.
      branchScope(actor, to.branchId);
      if (!(await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId)).limit(1)).length) throw new HttpError(400, "Raw material not found");
      // GAP-014: an optional requisitionLineId declares which internal
      // requisition line this real dispatch fulfills — validated against
      // that line's approved qty and destination branch, never a
      // duplicated dispatch mechanism.
      const requisitionLineId = input.requisitionLineId === undefined ? null : string(input.requisitionLineId, "requisitionLineId");
      if (requisitionLineId) await assertRequisitionLineFulfillable(tx, requisitionLineId, "RAW", to.branchId, qtyDispatched);

      const id = randomUUID();
      // FEFO-allocate from the warehouse's real lots BEFORE the flat balance
      // debit — expired/unknown stock cannot cover a dispatch (allowExpired:
      // false), same hard-block as production/POS consumption.
      const allocations = await allocateLocatedConsume(tx, { warehouseId: fromWarehouseId }, rawMaterialId, qtyDispatched, { allowExpired: false, actorId: actor.id, sourceType: "TRANSFER_DISPATCH", sourceId: id });
      // Atomic debit of the source CENTRAL warehouse's flat balance — if
      // insufficient, the whole mutate() transaction rolls back and no
      // transfer row (or allocation) is left dangling. Both debits must
      // agree; a mismatch here means the aggregate/lot invariant already
      // drifted and is a reconciliation bug, not something to paper over.
      await debitWarehouseStock(tx, fromWarehouseId, rawMaterialId, qtyDispatched);

      await tx.insert(stockTransfers).values({ id, fromWarehouseId, toWarehouseId, rawMaterialId, qtyDispatched, dispatchedById: actor.id, requisitionLineId });
      for (const allocation of allocations) {
        await tx.insert(batchTransferAllocations).values({ id: randomUUID(), transferId: id, batchId: allocation.batchId, originBatchId: allocation.originBatchId, batchNo: allocation.batchNo, expiryDate: allocation.expiryDate, expiryStatus: allocation.expiryStatus, qtyDispatched: allocation.qty, unitCostTsh: allocation.unitCostTsh, actorId: actor.id });
      }
      const [row] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id));
      return row;
    });
    return json({ stockTransfer: transfer }, 201);
  });
}
