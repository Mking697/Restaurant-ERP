import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { branchFoodCost, foodRates, reportBranches, reportMonth } from "../_data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "REPORTS");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, query.get("branchId"));
    const month = reportMonth(query.get("month"));
    const [branches, rates] = await Promise.all([reportBranches(scope), foodRates()]);
    const rows = await Promise.all(branches.map(async (branch) => ({ branchId: branch.id, branchName: branch.name, ...await branchFoodCost(actor, branch.id, month, rates) })));
    return json({ month: month.month, branches: rows, ...(scope ? rows[0] : {}) });
  });
}
