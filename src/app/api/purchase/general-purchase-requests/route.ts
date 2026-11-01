import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { generalPurchaseRequests } from "@/db/schema/purchase";
import { users } from "@/db/schema/auth";
import { branches } from "@/db/schema/platform";
import { vendors } from "@/db/schema/vendors";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { allowedFields, parsePoLines } from "@/lib/server/purchase";
import { readBusinessPolicy } from "@/lib/server/business-policy";
import { submitGeneralPurchaseRequest } from "@/lib/server/general-purchase-approval";
import { assertVendorEligible } from "@/lib/server/vendor-approval";
import { ensureBranch, ensureVendor } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/purchase/general-purchase-requests?branchId= — branch-scoped
// list, mainly for the Owner's review queue and a branch checking its own
// request's status before retrying the real PO creation.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, query.get("branchId"));
    if (!scope) throw new HttpError(400, "Select a branch");
    const rows = await db
      .select({
        id: generalPurchaseRequests.id, branchId: generalPurchaseRequests.branchId, branch: branches.name,
        requestedById: generalPurchaseRequests.requestedById, requestedBy: users.name,
        vendorId: generalPurchaseRequests.vendorId, vendor: vendors.name,
        linesJson: generalPurchaseRequests.linesJson, valueTsh: generalPurchaseRequests.valueTsh,
        status: generalPurchaseRequests.status, approvedById: generalPurchaseRequests.approvedById,
        approvedAt: generalPurchaseRequests.approvedAt, createdAt: generalPurchaseRequests.createdAt,
      })
      .from(generalPurchaseRequests)
      .innerJoin(branches, eq(branches.id, generalPurchaseRequests.branchId))
      .innerJoin(users, eq(users.id, generalPurchaseRequests.requestedById))
      .innerJoin(vendors, eq(vendors.id, generalPurchaseRequests.vendorId))
      .where(eq(generalPurchaseRequests.branchId, scope))
      .orderBy(generalPurchaseRequests.createdAt)
      .limit(200);
    return json({ generalPurchaseRequests: rows });
  });
}

// POST /api/purchase/general-purchase-requests — GAP-016. Submits a
// general-purchase request for the Owner's mandatory value-threshold
// review BEFORE the real PO can be created. Below the Owner's configured
// threshold (or no threshold set) auto-approves immediately — zero added
// friction, matching the indent free path.
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_ORDER");
      const input = await body(request);
      allowedFields(input, ["branchId", "vendorId", "lines"]);
      const branchId = branchScope(actor, string(input.branchId, "branchId"));
      if (!branchId) throw new HttpError(400, "Select a branch");
      await ensureBranch(tx, branchId);
      const vendorId = string(input.vendorId, "vendorId");
      await ensureVendor(tx, vendorId);
      await assertVendorEligible(tx, vendorId, branchId, []);
      const lines = parsePoLines(input.lines, true);
      const policy = await readBusinessPolicy();
      return submitGeneralPurchaseRequest(tx, actor, branchId, vendorId, lines.map((l) => ({ itemDescription: l.itemDescription, qty: l.qty, rate: l.rate })), policy.indentValueThresholdTsh);
    });
    return json(result, 201);
  });
}
