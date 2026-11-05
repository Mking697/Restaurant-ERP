import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { mergeCustomers } from "@/lib/server/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-038: folds the member identified by [id] INTO body.intoId. Both
// directions of edit authority are checked inside mergeCustomers itself —
// Branch Manager/Owner only, never a plain cashier.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const customer = await mutate(request, async (tx, actor) => mergeCustomers(tx, actor, id, (await body(request)).intoId));
    return json({ customer });
  });
}
