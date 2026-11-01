import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { cancelRemainingReturnDispatch } from "@/lib/server/vendor-return-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/material-returns/[id]/cancel-remaining — Owner-only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const input = await body(request);
    allowedFields(input, ["remainingCancelledNote"]);
    const result = await mutate(request, (tx, actor) => cancelRemainingReturnDispatch(tx, actor, id, input));
    return json(result);
  });
}
