import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { listHoReviewQueue } from "@/lib/server/ho-stock-review";
import { HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const branchId = query.get("branchId") ?? "";
    if (!branchId || branchId === "all") throw new HttpError(400, "Select one branch");
    const unresolvedOnly = query.get("unresolved") !== "false";
    const reviews = await locked(async tx => listHoReviewQueue(tx, await requireIdentity(request, tx), branchId, unresolvedOnly));
    return json({ reviews });
  });
}
