import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { acknowledgeReturnDispatch } from "@/lib/server/vendor-return-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/material-return-dispatches/[id]/acknowledge
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    allowedFields(await body(request), []);
    const result = await mutate(request, (tx, actor) => acknowledgeReturnDispatch(tx, actor, id));
    return json(result);
  });
}
