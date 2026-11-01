import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { suspendVendor } from "@/lib/server/vendor-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/vendors/[id]/suspend — Owner-only. Does not touch
// any existing document's vendorId; only blocks NEW purchasing against
// this vendor going forward (checked inside the PO-creation transaction).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const input = await body(request);
    const vendor = await mutate(request, (tx, actor) => suspendVendor(tx, actor, id, input));
    return json({ vendor });
  });
}
