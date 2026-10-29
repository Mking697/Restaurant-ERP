import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { computeBalanceSheet, ensureLedgerBranch, queryBranchId, seedLedgerAccounts } from "@/lib/server/accounts-ledger";
import { assertOwner, branchScope, hasModule, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET is a pure read — it never creates rows. If no ledgerAccounts exist yet
// for this branch/HQ scope, computeBalanceSheet honestly reports `seeded:
// false` with real zeros instead of seeding on the fly (which would make the
// "nothing exists yet" state unobservable). POST (Owner-only) is the
// explicit, idempotent action that seeds the shared HQ chart of accounts —
// see seedLedgerAccounts' doc comment for exactly what it creates.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    if (!hasModule(actor, "PETTY_CASH") && !hasModule(actor, "AGGREGATOR_RECON") && !hasModule(actor, "ACCOUNTS_EXPENSES")) throw new HttpError(403, "Module access required");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, queryBranchId(query.get("branchId")));
    if (!scope) throw new HttpError(400, "Select a branch");
    await ensureLedgerBranch(db, scope);
    return json(await computeBalanceSheet(db, scope));
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertOwner(actor);
      const input = await body(request);
      if (Object.keys(input).length) throw new HttpError(400, "No fields are accepted by this action");
      return seedLedgerAccounts(tx);
    });
    return json(result);
  });
}
