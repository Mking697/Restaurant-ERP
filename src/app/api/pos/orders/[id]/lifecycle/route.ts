import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { actPosOrder } from "@/lib/server/pos-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => actPosOrder(tx, actor, id, await body(request)));
    return json(result);
  });
}
