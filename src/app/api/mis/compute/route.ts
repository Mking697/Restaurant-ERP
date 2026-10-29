import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertCanComputeMis, computeAndUpsertBranch, parseComputeInput, targetBranches } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/mis/compute — Owner/CENTRAL_STORE_MGR only (see mis.ts for why
// this is a dedicated role check, not assertModule/branchScope). Computes
// and upserts a branch-level mis_scores row for every target branch (one
// branch if branchId is given, every branch otherwise), each from real rows
// only — never fabricates a score for a branch with no real data in the
// period (that branch is reported `computed: false` with a reason instead).
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertCanComputeMis(actor);
      const input = parseComputeInput(await body(request));
      const branches = await targetBranches(tx, input.branchId);
      const results = [];
      for (const branch of branches) {
        results.push(await computeAndUpsertBranch(tx, branch.id, branch.name, input.periodStart, input.periodEnd));
      }
      return { periodStart: input.periodStart.toISOString(), periodEnd: input.periodEnd.toISOString(), results };
    });
    return json(result);
  });
}
