import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { listReturnDispatches, recordReturnDispatch } from "@/lib/server/vendor-return-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-018. GET lists dispatch events for a claim; POST records a new one.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const actor = await requireIdentity(request);
    const dispatches = await listReturnDispatches(db, actor, id);
    return json({ dispatches });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const input = await body(request);
    allowedFields(input, ["qtyDispatched", "reasonNote", "evidencePhotoUrl"]);
    const result = await mutate(request, (tx, actor) => recordReturnDispatch(tx, actor, id, input));
    return json(result, 201);
  });
}
