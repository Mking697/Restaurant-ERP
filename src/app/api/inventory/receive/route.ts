import { mutate } from "@/lib/server/auth";
import { api } from "@/lib/server/http";
import { assertModule, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unbound branch/material increments cannot prove a GRN has not already posted.
// Reject old clients explicitly; all quality stock writes now share one receipt.
export async function POST(request: Request) {
  return api(async () => mutate(request, async (_tx, actor) => {
    assertModule(actor, "INVENTORY");
    throw new HttpError(410, "Unbound inventory receive retired; use /api/purchase/grns/[id]/quality");
  }));
}
