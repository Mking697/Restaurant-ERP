import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { pettyCashEntries } from "@/db/schema/accounts";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { ensureLedgerBranch, ledgerMonth, pettyCashColumns, pettyCashWindow, postPettyCashEntry, queryBranchId } from "@/lib/server/accounts-ledger";
import { assertModule, branchScope } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PETTY_CASH");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, queryBranchId(query.get("branchId")));
    const range = ledgerMonth(query.get("month"));
    await ensureLedgerBranch(db, scope);
    const entries = await db.select(pettyCashColumns).from(pettyCashEntries).where(pettyCashWindow(scope, range)).orderBy(asc(pettyCashEntries.entryDate), asc(pettyCashEntries.id));
    const currentBalance = scope ? (entries.length ? entries[entries.length - 1].balanceAfterInr : "0.00") : null;
    return json({ entries, currentBalance, month: range.month });
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const entry = await mutate(request, async (tx, actor) => postPettyCashEntry(tx, actor, await body(request)));
    return json({ entry }, 201);
  });
}
