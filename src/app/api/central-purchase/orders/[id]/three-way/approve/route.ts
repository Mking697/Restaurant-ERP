import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { approveCentralThreeWayPayment } from "@/lib/server/central-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/central-purchase/orders/[id]/three-way/approve — ACCOUNTS_EXPENSES.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => approveCentralThreeWayPayment(tx, actor, id));
    return json(result);
  });
}
