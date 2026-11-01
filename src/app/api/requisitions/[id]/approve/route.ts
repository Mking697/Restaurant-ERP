import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { approveRequisition } from "@/lib/server/requisitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const requisition = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      return approveRequisition(tx, actor, id, input);
    });
    return json({ requisition });
  });
}
