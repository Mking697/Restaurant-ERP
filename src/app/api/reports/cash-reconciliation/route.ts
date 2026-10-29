import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { ledgerDate } from "@/lib/server/accounts-ledger";
import { cashReconSummary, istDayKey, istDayRange } from "../_aggregation";
import { closingCash, reportBranches } from "../_data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "REPORTS");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, query.get("branchId"));
    await reportBranches(scope);
    const to = query.get("to") ?? istDayKey(new Date());
    const from = query.get("from") ?? istDayKey(new Date(Date.now() - 30 * 86400000));
    ledgerDate(from); ledgerDate(to); // strict calendar validation, not Date rollover
    const start = istDayRange(new Date(`${from}T12:00:00+05:30`)).start;
    const end = istDayRange(new Date(`${to}T12:00:00+05:30`)).end;
    if (start >= end || end.getTime() - start.getTime() > 367 * 86400000) throw new HttpError(400, "Invalid date range (maximum 366 days)");
    const rows = await closingCash(scope, { start, end });
    return json({ branchId: scope, from, to, timezone: "Asia/Kolkata", rows, summary: cashReconSummary(rows) });
  });
}
