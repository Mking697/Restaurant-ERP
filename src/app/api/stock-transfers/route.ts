import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stockTransfers, warehouses } from "@/db/schema/warehouses";
import { rawMaterials } from "@/db/schema/menu";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, numeric, string } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Central-to-branch stock movement, dispatch-then-receive verified the same
// way a vendor GRN is (see purchase.ts's three-way match). This pass only
// supports CENTRAL -> BRANCH transfers (not branch-to-branch) — keeps the
// inventory-mutation side unambiguous (only one branch's inventory_stock is
// ever touched, on receive — see [id]/receive/route.ts). Dispatch does NOT
// move any quantity out of a tracked balance: central warehouse stock has no
// quantity ledger yet in this schema (warehouses.ts's own comment flags
// this) — dispatch is a paper/audit record of what's in transit, nothing
// more, until that follow-up lands.
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
    return json({ stockTransfers: rows });
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

      const id = randomUUID();
      await tx.insert(stockTransfers).values({ id, fromWarehouseId, toWarehouseId, rawMaterialId, qtyDispatched, dispatchedById: actor.id });
      const [row] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id));
      return row;
    });
    return json({ stockTransfer: transfer }, 201);
  });
}
