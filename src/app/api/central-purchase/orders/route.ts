import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { centralPurchaseOrders, centralPurchaseOrderLines } from "@/db/schema/central-purchase";
import { vendors } from "@/db/schema/vendors";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { allowedFields } from "@/lib/server/purchase";
import { createCentralPurchaseOrder, parseCentralLines } from "@/lib/server/central-purchase";
import { ensureRawMaterial, ensureVendor } from "../../purchase/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/central-purchase/orders?warehouseId= — the Central Purchase Order list.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const warehouseId = new URL(request.url).searchParams.get("warehouseId");
    const rows = await db
      .select({
        id: centralPurchaseOrders.id, poNumber: centralPurchaseOrders.poNumber, warehouseId: centralPurchaseOrders.warehouseId,
        vendorId: centralPurchaseOrders.vendorId, vendor: vendors.name, status: centralPurchaseOrders.status,
        boughtAt: centralPurchaseOrders.boughtAt, billUploadedAt: centralPurchaseOrders.billUploadedAt,
        materialReceivedAt: centralPurchaseOrders.materialReceivedAt, createdAt: centralPurchaseOrders.createdAt,
      })
      .from(centralPurchaseOrders)
      .innerJoin(vendors, eq(vendors.id, centralPurchaseOrders.vendorId))
      .where(warehouseId ? eq(centralPurchaseOrders.warehouseId, warehouseId) : undefined)
      .orderBy(centralPurchaseOrders.createdAt)
      .limit(200);
    if (!rows.length) return json({ centralPurchaseOrders: [] });
    const allLines = await db.select({ poId: centralPurchaseOrderLines.poId, rawMaterialId: centralPurchaseOrderLines.rawMaterialId, qty: centralPurchaseOrderLines.qty, rate: centralPurchaseOrderLines.rate }).from(centralPurchaseOrderLines);
    const byPo = new Map<string, typeof allLines>();
    for (const line of allLines) { const bucket = byPo.get(line.poId) ?? []; bucket.push(line); byPo.set(line.poId, bucket); }
    return json({ centralPurchaseOrders: rows.map((r) => ({ ...r, lines: byPo.get(r.id) ?? [] })) });
  });
}

// POST /api/central-purchase/orders — Step 1 (Buy). Requires an APPROVED,
// not-yet-consumed Central Purchase Request matching this exact
// warehouse/vendor/lines (see createCentralPurchaseOrder).
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_ORDER");
      const input = await body(request);
      allowedFields(input, ["warehouseId", "vendorId", "requestId", "lines"]);
      const warehouseId = string(input.warehouseId, "warehouseId");
      const vendorId = string(input.vendorId, "vendorId");
      await ensureVendor(tx, vendorId);
      const requestId = string(input.requestId, "requestId");
      const lines = parseCentralLines(input.lines);
      for (const line of lines) await ensureRawMaterial(tx, line.rawMaterialId);
      return createCentralPurchaseOrder(tx, actor, warehouseId, vendorId, requestId, lines);
    });
    return json(result, 201);
  });
}
