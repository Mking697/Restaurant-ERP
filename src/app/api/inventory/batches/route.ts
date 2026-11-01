import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stockBatches, inventoryStock } from "@/db/schema/inventory";
import { warehouseStock } from "@/db/schema/warehouse-stock";
import { rawMaterials } from "@/db/schema/menu";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, assertOwner, branchScope, HttpError } from "@/lib/server/permissions";
import { readBusinessPolicy } from "@/lib/server/business-policy";
import { businessDateString } from "@/lib/server/business-calendar";
import { batchDisposition } from "@/lib/server/batch-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-006: lot detail + expiry exception view, plus aggregate/lot
// reconciliation. branchId and warehouseId are mutually exclusive — a
// CENTRAL warehouse's lots are Owner-only (branch lots stay INVENTORY-
// module-gated like every other branch inventory read).
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    const url = new URL(request.url);
    const branchParam = url.searchParams.get("branchId");
    const warehouseParam = url.searchParams.get("warehouseId");
    if (branchParam && warehouseParam) throw new HttpError(400, "Supply branchId or warehouseId, not both");
    const rawMaterialId = url.searchParams.get("rawMaterialId");

    let scope: { branchId?: string; warehouseId?: string };
    if (warehouseParam) {
      assertOwner(actor);
      scope = { warehouseId: warehouseParam };
    } else {
      assertModule(actor, "INVENTORY");
      const branchScoped = branchScope(actor, branchParam);
      scope = branchScoped ? { branchId: branchScoped } : {};
    }

    const policy = await readBusinessPolicy();
    const today = businessDateString();
    const warnDays = policy.nearExpiryWarningDays === null ? null : Number(policy.nearExpiryWarningDays);
    const warnCutoff = warnDays === null ? null : new Date(new Date(today).getTime() + warnDays * 86400000).toISOString().slice(0, 10);

    const rows = await db.select({
      id: stockBatches.id, branchId: stockBatches.branchId, warehouseId: stockBatches.warehouseId, rawMaterialId: stockBatches.rawMaterialId,
      name: rawMaterials.name, unit: rawMaterials.unit, batchNo: stockBatches.batchNo,
      qtyReceived: stockBatches.qtyReceived, qtyRemaining: stockBatches.qtyRemaining,
      expiryDate: stockBatches.expiryDate, expiryStatus: stockBatches.expiryStatus, receivedAt: stockBatches.receivedAt,
    }).from(stockBatches).innerJoin(rawMaterials, eq(rawMaterials.id, stockBatches.rawMaterialId))
      .where(and(
        scope.branchId ? eq(stockBatches.branchId, scope.branchId) : scope.warehouseId ? eq(stockBatches.warehouseId, scope.warehouseId) : undefined,
        rawMaterialId ? eq(stockBatches.rawMaterialId, rawMaterialId) : undefined,
      )).orderBy(asc(stockBatches.expiryDate), asc(stockBatches.id)).limit(500);

    const batches = rows
      .filter((row) => Number(row.qtyRemaining) > 0)
      .map((row) => {
        const disposition = batchDisposition(row, today);
        return {
          ...row,
          expired: disposition.expired,
          held: disposition.held,
          nearExpiry: !disposition.expired && warnCutoff !== null && row.expiryDate !== null && row.expiryDate <= warnCutoff,
        };
      });

    // Reconciliation: every location's saved aggregate vs the sum of its
    // real remaining lots — a positive unbatched difference means real
    // stock predates batch tracking and needs Owner reconciliation (see
    // POST /api/inventory/batches/reconcile), never silently assumed zero.
    let reconciliation: { branchId: string | null; warehouseId: string | null; rawMaterialId: string; name: string; unit: string; qtyOnHand: string; batchQty: string; unbatchedQty: string }[] = [];
    if (scope.branchId) {
      const agg = await db.select({ rawMaterialId: inventoryStock.rawMaterialId, name: rawMaterials.name, unit: rawMaterials.unit, qtyOnHand: inventoryStock.qtyOnHand })
        .from(inventoryStock).innerJoin(rawMaterials, eq(rawMaterials.id, inventoryStock.rawMaterialId))
        .where(and(eq(inventoryStock.branchId, scope.branchId), rawMaterialId ? eq(inventoryStock.rawMaterialId, rawMaterialId) : undefined));
      const batchByMaterial = new Map<string, number>();
      for (const row of rows) batchByMaterial.set(row.rawMaterialId, (batchByMaterial.get(row.rawMaterialId) ?? 0) + Number(row.qtyRemaining));
      reconciliation = agg.map((row) => {
        const batchQty = (batchByMaterial.get(row.rawMaterialId) ?? 0).toFixed(3);
        return { branchId: scope.branchId!, warehouseId: null, rawMaterialId: row.rawMaterialId, name: row.name, unit: row.unit, qtyOnHand: row.qtyOnHand, batchQty, unbatchedQty: (Number(row.qtyOnHand) - Number(batchQty)).toFixed(3) };
      }).filter((row) => Number(row.unbatchedQty) !== 0);
    } else if (scope.warehouseId) {
      const agg = await db.select({ rawMaterialId: warehouseStock.rawMaterialId, name: rawMaterials.name, unit: rawMaterials.unit, qtyOnHand: warehouseStock.qtyOnHand })
        .from(warehouseStock).innerJoin(rawMaterials, eq(rawMaterials.id, warehouseStock.rawMaterialId))
        .where(and(eq(warehouseStock.warehouseId, scope.warehouseId), rawMaterialId ? eq(warehouseStock.rawMaterialId, rawMaterialId) : undefined));
      const batchByMaterial = new Map<string, number>();
      for (const row of rows) batchByMaterial.set(row.rawMaterialId, (batchByMaterial.get(row.rawMaterialId) ?? 0) + Number(row.qtyRemaining));
      reconciliation = agg.map((row) => {
        const batchQty = (batchByMaterial.get(row.rawMaterialId) ?? 0).toFixed(3);
        return { branchId: null, warehouseId: scope.warehouseId!, rawMaterialId: row.rawMaterialId, name: row.name, unit: row.unit, qtyOnHand: row.qtyOnHand, batchQty, unbatchedQty: (Number(row.qtyOnHand) - Number(batchQty)).toFixed(3) };
      }).filter((row) => Number(row.unbatchedQty) !== 0);
    }

    return json({
      batches,
      reconciliation,
      policy: { nearExpiryWarningDays: policy.nearExpiryWarningDays },
      summary: { total: batches.length, expiredCount: batches.filter((b) => b.expired).length, nearExpiryCount: batches.filter((b) => b.nearExpiry).length, heldCount: batches.filter((b) => b.held).length },
    });
  });
}
