import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { cancelRequisitionLine } from "@/lib/server/requisitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const line = await mutate(request, async (tx, actor) => cancelRequisitionLine(tx, actor, id));
    return json({ line });
  });
}
