import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { branchScope, HttpError, hasModule, type Identity } from "@/lib/server/permissions";
import { acceptHandover } from "@/lib/server/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertOperational(actor: Identity) {
  if (!hasModule(actor, "POS_CASHIER") && !hasModule(actor, "CASH_DROP") && !hasModule(actor, "SHIFT_MANAGEMENT")) {
    throw new HttpError(403, "POS, Cash Drop or Shift Management access required");
  }
}

// The incoming shift's first action: accept the cash/card/UPI totals handed
// over from the previous shift. Until this happens, POS orders and End
// Shift are both blocked for the new run (see requireOperableShift).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const handover = await mutate(request, async (tx, actor) => {
      assertOperational(actor);
      const input = await body(request);
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      return acceptHandover(tx, actor, branchId, id);
    });
    return json({ handover }, 200);
  });
}
