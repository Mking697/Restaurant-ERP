import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { rejectCentralPurchaseRequest } from "@/lib/server/central-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/central-purchase/requests/[id]/reject — Owner-only.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const result = await mutate(request, async (tx, actor) => rejectCentralPurchaseRequest(tx, actor, id));
    return json({ request: result });
  });
}
