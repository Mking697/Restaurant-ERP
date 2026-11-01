import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { listYieldDeviations } from "@/lib/server/yield-standards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-011 review queue — any MENU_BOM-authorized reader can see it; only
// the Owner can actually review (enforced inside reviewYieldDeviation,
// [id]/review/route.ts).
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "MENU_BOM");
    const params = new URL(request.url).searchParams;
    const deviations = await listYieldDeviations(db, actor, { branchId: params.get("branchId"), unreviewedOnly: params.get("unreviewedOnly") === "true" });
    return json({ deviations });
  });
}
