import { locked, mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { readOrderReversal, voidPosOrder } from "@/lib/server/pos-order-reversals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const reversal = await locked(async tx => readOrderReversal(tx, await requireIdentity(request, tx), id));
    return json({ reversal });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => voidPosOrder(tx, actor, id, await body(request)));
    return json(result, (result as { replayed?: boolean }).replayed ? 200 : 201);
  });
}
