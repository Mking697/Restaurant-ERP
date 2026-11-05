import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { hoCashDispatches } from "@/db/schema/shifts";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { branchScope, HttpError, hasModule, type Identity } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertOperational(actor: Identity) {
  if (!hasModule(actor, "POS_CASHIER") && !hasModule(actor, "CASH_DROP") && !hasModule(actor, "SHIFT_MANAGEMENT")) {
    throw new HttpError(403, "POS, Cash Drop or Shift Management access required");
  }
}

// GAP-036: a branch-scoped actor sees only their own branch's dispatch
// history (own-branch awareness of in-transit cash). The Owner with no
// branchId filter sees every branch's dispatches — the Head Office review
// queue, including PENDING ones awaiting acceptance.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertOperational(actor);
    const branchId = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const rows = branchId
      ? await db.select().from(hoCashDispatches).where(eq(hoCashDispatches.branchId, branchId)).orderBy(desc(hoCashDispatches.dispatchedAt)).limit(200)
      : await db.select().from(hoCashDispatches).orderBy(desc(hoCashDispatches.dispatchedAt)).limit(200);
    return json({ dispatches: rows });
  });
}
