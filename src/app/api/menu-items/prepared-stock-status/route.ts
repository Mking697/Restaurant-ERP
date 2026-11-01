import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { listPreparedStockStatus } from "@/lib/server/prepared-stock-thresholds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "MENU_BOM");
    const branchId = new URL(request.url).searchParams.get("branchId");
    const status = await listPreparedStockStatus(db, actor, { branchId });
    return json({ status });
  });
}
