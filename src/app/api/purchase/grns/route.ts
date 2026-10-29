import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { GRN_STATUSES, parseStatusFilter } from "@/lib/server/purchase";
import { readGrns } from "@/lib/server/grn-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Locked multi-query snapshot: final decision, every line and posting receipt
// cannot be mixed with a concurrent quality transaction.
export async function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const result = await locked(async tx => readGrns(tx, await requireIdentity(request, tx), {
      branchId: query.get("branchId"), status: parseStatusFilter(query.get("status"), GRN_STATUSES),
    }));
    return json({ grns: result });
  });
}
