import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { listMisScores } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mis/scores?branchId=&periodStart=&periodEnd= — the exact
// contract the Dashboard/Reports (3b) pass and the Performance page read
// from. branchId is branch-scoped for non-Owner readers (see branchScope()
// inside listMisScores); optional period bounds select stored periods fully
// contained by those bounds. With no bounds, every computed row in scope
// is returned. Rank is always
// computed fresh on this read, never stored, since it is relative to
// whatever set is currently being viewed.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    const query = new URL(request.url).searchParams;
    const scores = await listMisScores(db, actor, {
      branchId: query.get("branchId"),
      periodStart: query.get("periodStart"),
      periodEnd: query.get("periodEnd"),
      periodMatch: query.get("periodMatch"),
    });
    return json({ scores });
  });
}
