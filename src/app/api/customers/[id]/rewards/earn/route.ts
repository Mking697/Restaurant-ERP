import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { earnPoints } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const event = await mutate(request, async (tx, actor) => {
      assertModule(actor, "POS_CASHIER");
      const input = await body(request);
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      const sourceOrderId = typeof input.sourceOrderId === "string" ? input.sourceOrderId : "";
      if (!sourceOrderId) throw new HttpError(400, "sourceOrderId required");
      return earnPoints(tx, actor, branchId, id, sourceOrderId);
    });
    return json({ event }, event ? 201 : 200);
  });
}
