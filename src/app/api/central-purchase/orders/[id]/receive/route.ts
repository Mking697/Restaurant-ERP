import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { receiveCentralPo } from "@/lib/server/central-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/central-purchase/orders/[id]/receive — Step 3 (Material
// Receive). Creates a PENDING-quality GRN; no stock posted until the
// separate quality-check call. v1: one receive per PO (no partial-delivery
// split — see the schema file's comment).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const result = await mutate(request, async (tx, actor) => receiveCentralPo(tx, actor, id));
    return json(result, 201);
  });
}
