import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { listRequisitions, submitRequisition } from "@/lib/server/requisitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-014. Internal requisition — mixed RAW+PREPARED lines, Owner-only
// approval (see [id]/approve/route.ts), fulfillment via the EXISTING
// stock-transfers / semi-fg-transfers dispatch endpoints. See
// src/db/schema/requisitions.ts for the full design note.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "INVENTORY");
    const requisitions = await listRequisitions(db, actor, { branchId: new URL(request.url).searchParams.get("branchId") });
    return json({ requisitions });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const requisition = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      return submitRequisition(tx, actor, input);
    });
    return json({ requisition }, 201);
  });
}
