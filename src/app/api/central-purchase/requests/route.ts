import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { centralPurchaseRequests } from "@/db/schema/central-purchase";
import { users } from "@/db/schema/auth";
import { vendors } from "@/db/schema/vendors";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { assertModule, assertCentralStoreAccess, HttpError } from "@/lib/server/permissions";
import { allowedFields } from "@/lib/server/purchase";
import { readBusinessPolicy } from "@/lib/server/business-policy";
import { parseCentralLines, submitCentralPurchaseRequest } from "@/lib/server/central-purchase";
import { assertCentralWarehouse } from "@/lib/server/warehouse-stock";
import { ensureVendor } from "../../purchase/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/central-purchase/requests?warehouseId= — Owner's review queue +
// requester's own status check, same shape as general-purchase-requests.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertCentralStoreAccess(actor);
    assertModule(actor, "PURCHASE_ORDER");
    const warehouseId = new URL(request.url).searchParams.get("warehouseId");
    const rows = await db
      .select({
        id: centralPurchaseRequests.id, warehouseId: centralPurchaseRequests.warehouseId,
        requestedById: centralPurchaseRequests.requestedById, requestedBy: users.name,
        vendorId: centralPurchaseRequests.vendorId, vendor: vendors.name,
        linesJson: centralPurchaseRequests.linesJson, valueTsh: centralPurchaseRequests.valueTsh,
        status: centralPurchaseRequests.status, approvedById: centralPurchaseRequests.approvedById,
        approvedAt: centralPurchaseRequests.approvedAt, createdAt: centralPurchaseRequests.createdAt,
      })
      .from(centralPurchaseRequests)
      .innerJoin(users, eq(users.id, centralPurchaseRequests.requestedById))
      .innerJoin(vendors, eq(vendors.id, centralPurchaseRequests.vendorId))
      .where(warehouseId ? eq(centralPurchaseRequests.warehouseId, warehouseId) : undefined)
      .orderBy(centralPurchaseRequests.createdAt)
      .limit(200);
    return json({ centralPurchaseRequests: rows });
  });
}

// POST /api/central-purchase/requests — any PURCHASE_ORDER actor can raise
// a Central Purchase request; gated by the Owner's existing indent value
// threshold (see submitCentralPurchaseRequest's own comment for why this
// reuses that policy number rather than adding a new one).
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_ORDER");
      const input = await body(request);
      allowedFields(input, ["warehouseId", "vendorId", "lines"]);
      const warehouseId = string(input.warehouseId, "warehouseId");
      await assertCentralWarehouse(tx, warehouseId);
      const vendorId = string(input.vendorId, "vendorId");
      await ensureVendor(tx, vendorId);
      const lines = parseCentralLines(input.lines);
      const policy = await readBusinessPolicy();
      return submitCentralPurchaseRequest(tx, actor, warehouseId, vendorId, lines, policy.indentValueThresholdTsh);
    });
    return json(result, 201);
  });
}
