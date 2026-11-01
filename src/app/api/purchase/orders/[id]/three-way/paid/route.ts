import { mutate } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { recordVendorPayment } from "@/lib/server/vendor-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/orders/[id]/three-way/paid — ACCOUNTS_EXPENSES-only.
// GAP-017: now real payment evidence (amount/date/method/reference), not a
// bare status flip. See recordVendorPayment for the APPROVED-only gate,
// the full-payment-only rule and idempotency-key replay semantics.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const input = await body(request);
    allowedFields(input, ["amountTsh", "paymentMethod", "referenceNumber", "paidAt", "idempotencyKey"]);
    const result = await mutate(request, async (tx, actor) => recordVendorPayment(tx, actor, string((await params).id, "PO ID"), input));
    return json(result, result.replayed ? 200 : 201);
  });
}
