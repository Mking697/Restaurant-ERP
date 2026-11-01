import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { approveGeneralPurchaseRequest } from "@/lib/server/general-purchase-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/general-purchase-requests/[id]/approve — Owner-only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const request_ = await mutate(request, (tx, actor) => approveGeneralPurchaseRequest(tx, actor, id));
    return json({ request: request_ });
  });
}
