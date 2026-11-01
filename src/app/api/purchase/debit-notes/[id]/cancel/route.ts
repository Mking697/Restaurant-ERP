import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { cancelDebitNote } from "@/lib/server/debit-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/debit-notes/[id]/cancel — ACCOUNTS_EXPENSES/Owner-only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const input = await body(request);
    allowedFields(input, ["cancelledNote"]);
    const result = await mutate(request, (tx, actor) => cancelDebitNote(tx, actor, id, input));
    return json(result);
  });
}
