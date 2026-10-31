import { mutate } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { approveThreeWayPayment } from "@/lib/server/vendor-invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/orders/[id]/three-way/approve — ACCOUNTS_EXPENSES-only.
// See approveThreeWayPayment for the matched/PENDING-only guard.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    allowedFields(await body(request), []);
    return json(await mutate(request, async (tx, actor) => approveThreeWayPayment(tx, actor, string((await params).id, "PO ID"))));
  });
}
