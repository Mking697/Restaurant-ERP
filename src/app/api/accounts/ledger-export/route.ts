import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { journalEntries, ledgerAccounts } from "@/db/schema/accounts";
import { branches } from "@/db/schema/platform";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { branchScope, hasModule, HttpError } from "@/lib/server/permissions";
import { queryBranchId } from "@/lib/server/accounts-ledger";
import { businessDateRange } from "@/lib/server/business-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
function requiredDate(value: string | null, label: string): string {
  if (typeof value !== "string" || !CALENDAR_DATE.test(value)) throw new HttpError(400, `${label} must be a YYYY-MM-DD date`);
  businessDateRange(value); // throws on an impossible calendar date (e.g. 2026-02-30)
  return value;
}

/** Every real income/expense event in this app (POS sale, branch expense,
 * payroll finalize, vendor refund claim/settlement, petty cash, aggregator
 * settlement — see accounts-ledger.ts) posts a balanced journal_entries row.
 * This is therefore the ONE place that can honestly answer "every income
 * and expense entry in this date range" without re-querying half a dozen
 * separate tables and risking missing one.
 *
 * Classification is by ledger account TYPE, not by a hand-maintained list of
 * referenceTypes, so a future posting function needs no edit here to show up
 * correctly:
 *   incomeAmount = +amount when the CREDIT account is INCOME (revenue
 *     recognized), -amount when the DEBIT account is INCOME (a contra/
 *     correction — not expected today, but handled rather than silently
 *     dropped).
 *   expenseAmount = +amount when the DEBIT account is EXPENSE (an expense
 *     recognized), -amount when the CREDIT account is EXPENSE (a reversal/
 *     void of a previously-posted expense — e.g. postExpenseVoidJournal —
 *     so a voided expense correctly nets to zero across the two rows
 *     instead of still counting as a live expense).
 * A row with both incomeAmount and expenseAmount nonzero is legitimate (e.g.
 * the aggregator commission/ads leg: Debit Other Expense / Credit Sales
 * Revenue is one real event touching both an income and an expense account).
 * A row touching neither (petty cash, Accounts Receivable claim/settle, tax
 * collection into VAT Payable, ...) is a pure balance-sheet movement and is
 * excluded — it is neither income nor expense. */
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    if (!hasModule(actor, "PETTY_CASH") && !hasModule(actor, "AGGREGATOR_RECON") && !hasModule(actor, "ACCOUNTS_EXPENSES")) throw new HttpError(403, "Module access required");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, queryBranchId(query.get("branchId")));
    const from = requiredDate(query.get("from"), "From"), to = requiredDate(query.get("to"), "To");
    if (from > to) throw new HttpError(400, "From date must not be after To date");
    const { start } = businessDateRange(from), { end } = businessDateRange(to);
    const debit = alias(ledgerAccounts, "debit_account"), credit = alias(ledgerAccounts, "credit_account");
    const rows = await db
      .select({
        id: journalEntries.id, entryDate: journalEntries.entryDate, description: journalEntries.description,
        amount: journalEntries.amount, referenceType: journalEntries.referenceType,
        branchId: journalEntries.branchId, branchName: branches.name,
        debitAccountName: debit.name, debitAccountType: debit.type,
        creditAccountName: credit.name, creditAccountType: credit.type,
      })
      .from(journalEntries)
      .innerJoin(debit, eq(debit.id, journalEntries.debitAccountId))
      .innerJoin(credit, eq(credit.id, journalEntries.creditAccountId))
      .innerJoin(branches, eq(branches.id, journalEntries.branchId))
      .where(and(scope ? eq(journalEntries.branchId, scope) : undefined, gte(journalEntries.entryDate, start), lt(journalEntries.entryDate, end)))
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.id));
    const entries = rows
      .map(({ debitAccountType, creditAccountType, amount, ...r }) => {
        const value = Number(amount);
        const incomeAmount = (creditAccountType === "INCOME" ? value : 0) - (debitAccountType === "INCOME" ? value : 0);
        const expenseAmount = (debitAccountType === "EXPENSE" ? value : 0) - (creditAccountType === "EXPENSE" ? value : 0);
        return { ...r, amount, incomeAmount: incomeAmount.toFixed(2), expenseAmount: expenseAmount.toFixed(2) };
      })
      .filter((r) => Number(r.incomeAmount) !== 0 || Number(r.expenseAmount) !== 0);
    const totalIncome = entries.reduce((sum, r) => sum + Number(r.incomeAmount), 0);
    const totalExpense = entries.reduce((sum, r) => sum + Number(r.expenseAmount), 0);
    return json({
      entries, from, to, branchId: scope,
      totals: { incomeInr: totalIncome.toFixed(2), expenseInr: totalExpense.toFixed(2), netInr: (totalIncome - totalExpense).toFixed(2) },
    });
  });
}
