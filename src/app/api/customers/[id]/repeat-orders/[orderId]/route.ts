import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { repeatOrderPreview } from "@/lib/server/repeat-orders";
import { db } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-041: read-only preview, mapping a past order's items onto the
// CURRENT catalog's availability/price. Placing the actual repeat order
// is a separate, explicit step through the existing order-creation flow.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const { id, orderId } = await params;
    const branchId = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    if (!branchId) throw new HttpError(400, "Select a branch");
    const preview = await repeatOrderPreview(db, actor, branchId, id, orderId);
    return json({ preview });
  });
}
