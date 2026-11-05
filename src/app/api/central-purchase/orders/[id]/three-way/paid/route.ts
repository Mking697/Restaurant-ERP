import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { markCentralThreeWayPaid } from "@/lib/server/central-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/central-purchase/orders/[id]/three-way/paid — ACCOUNTS_EXPENSES.
// v1: single state-flip evidence (see schema file comment on why this is
// simpler than the branch pipeline's GAP-017 vendor-payments.ts).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => markCentralThreeWayPaid(tx, actor, id));
    return json(result);
  });
}
