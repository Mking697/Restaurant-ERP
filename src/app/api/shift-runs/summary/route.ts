import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { HttpError, hasModule, type Identity } from "@/lib/server/permissions";
import { liveShiftSummary } from "@/lib/server/shift-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same gate as GET /api/shift-runs — operational read, not a mutation.
function assertOperational(actor: Identity) {
  if (!hasModule(actor, "POS_CASHIER") && !hasModule(actor, "CASH_DROP") && !hasModule(actor, "SHIFT_MANAGEMENT")) {
    throw new HttpError(403, "POS, Cash Drop or Shift Management access required");
  }
}

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertOperational(actor);
    const summary = await liveShiftSummary(db, actor, new URL(request.url).searchParams.get("branchId"));
    return json(summary);
  });
}
