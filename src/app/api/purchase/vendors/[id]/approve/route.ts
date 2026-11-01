import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { approveVendor } from "@/lib/server/vendor-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/vendors/[id]/approve — Owner-only. Sets vendor status
// to APPROVED with an optional single branch/category scope restriction
// (omit both = unrestricted everywhere).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const input = await body(request);
    const vendor = await mutate(request, (tx, actor) => approveVendor(tx, actor, id, input));
    return json({ vendor });
  });
}
