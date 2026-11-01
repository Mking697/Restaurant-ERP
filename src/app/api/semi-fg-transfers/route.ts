import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { dispatchSemiFgTransfer, listSemiFgTransfers } from "@/lib/server/semi-fg-transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-013. Branch-to-branch prepared Semi-FG transfer — a separate
// mechanism from the existing RAW CENTRAL-warehouse transfer
// (src/app/api/stock-transfers/route.ts). See
// src/db/schema/semi-fg-transfers.ts for the full design note.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "MENU_BOM");
    const transfers = await listSemiFgTransfers(db, actor, { branchId: new URL(request.url).searchParams.get("branchId") });
    return json({ semiFgTransfers: transfers });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const transfer = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      return dispatchSemiFgTransfer(tx, actor, input);
    });
    return json({ semiFgTransfer: transfer }, 201);
  });
}
