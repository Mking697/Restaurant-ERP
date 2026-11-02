import { locked, mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { generateEodStockReport, readEodStockReport } from "@/lib/server/eod-report";
import { HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/reports/eod-stock?branchId=...&reportDate=YYYY-MM-DD
export async function GET(request: Request) {
  return api(async () => {
    const q = new URL(request.url).searchParams;
    const branchId = q.get("branchId") ?? "";
    const reportDate = q.get("reportDate") ?? "";
    const report = await locked(async (tx) => readEodStockReport(tx, await requireIdentity(request, tx), branchId, reportDate));
    return json({ report });
  });
}

// POST /api/reports/eod-stock — generates (or regenerates) the current
// report for { branchId, reportDate }. See eod-report.ts for the
// ledger-cutoff reconstruction and latest-wins versioning rules.
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request);
    allowedFields(input, ["branchId", "reportDate", "requestKey", "regenerate"]);
    const branchId = typeof input.branchId === "string" ? input.branchId : "";
    const reportDate = typeof input.reportDate === "string" ? input.reportDate : "";
    const requestKey = typeof input.requestKey === "string" ? input.requestKey : "";
    const regenerate = input.regenerate;
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$/.test(requestKey)) throw new HttpError(400, "requestKey must be a UUID-like unique string");
    if (typeof regenerate !== "boolean") throw new HttpError(400, "regenerate must be boolean");
    const result = await mutate(request, (tx, actor) => generateEodStockReport(tx, actor, branchId, reportDate, { requestKey, regenerate }));
    return json(result, result.regenerated ? 200 : 201);
  });
}
