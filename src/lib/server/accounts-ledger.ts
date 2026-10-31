import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { aggregatorOrders, ledgerAccounts, journalEntries, pettyCashEntries } from "@/db/schema/accounts";
import { branches } from "@/db/schema/platform";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";

// ---------------------------------------------------------------------------
// Petty Cash Book / Aggregator Recon / Balance Sheet — real DB-backed routes
// for the 3 tabs that used to be mock-data.ts in accounts/legacy-demos.tsx.
// Expenses/P&L (src/lib/server/expenses.ts, src/app/api/accounts/expenses|
// profit-loss) are a separate, already-real pass — this file does not import
// from or modify that one; money/date helpers below are local copies of the
// same fixed-point-paise convention used throughout this project (expenses.ts,
// vat.ts) rather than a cross-module dependency.
// ---------------------------------------------------------------------------

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length > max || value.trim().length < min || /[\u0000-\u001f\u007f]/.test(value)) throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}
function paise(value: string): bigint {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error("Invalid persisted money");
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = raw.split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -amount : amount;
}
function decimal(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
function money(value: unknown, field: string, fallback?: string): string {
  const raw = value === undefined ? fallback : value;
  if (raw === undefined || typeof raw !== "string" || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(raw)) throw new HttpError(400, `Invalid ${field}`);
  const [whole, fraction = ""] = raw.split(".");
  return whole + "." + fraction.padEnd(2, "0");
}
function positiveMoney(value: unknown, field: string): string {
  const amount = money(value, field);
  if (amount === "0.00") throw new HttpError(400, `${field} must be positive`);
  return amount;
}
export function ledgerMonth(value: unknown): { month: string; start: Date; end: Date } {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new HttpError(400, "Invalid month");
  const start = new Date(`${value}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Invalid month");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { month: value, start, end };
}
export function ledgerDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, "Invalid date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(400, "Invalid date");
  return date;
}
/** Converts an absent/empty query param into "no branch filter" without
 * misreading "" as a mismatched branch id and 403-ing a non-Owner reader. */
export function queryBranchId(value: string | null): string | null {
  return value === null || value === "" ? null : value;
}
export async function ensureLedgerBranch(tx: Executor, branchId: string | null) {
  if (branchId && !(await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1)).length) throw new HttpError(404, "Branch not found");
}

// ---------------------------------------------------------------------------
// FINANCE-1: real double-entry journal postings for petty cash, posted
// expenses, finalized payroll and aggregator settlements, against the
// 12-account user-approved chart of accounts seeded by seedLedgerAccounts
// (Cash, Bank, Sales Revenue, Purchases/COGS, VAT Payable (18%), Accounts
// Payable, Rent/Utilities/Marketing/Other/Salary Expense, Owner's Equity).
//
// Idempotency/replay-safety: every posting goes through postJournalLeg,
// which is keyed by (referenceType, referenceId, leg) — the same triple is
// enforced UNIQUE at the DB level (journal_entries_posting_key_unique).
// Posting the same source event twice (client retry, webhook replay) is a
// silent, safe no-op: the existing row is returned, nothing is re-inserted
// and no duplicate ever reaches the Balance Sheet. All postings run inside
// the caller's own transaction (always the single global advisory-lock
// `mutate()`/`locked()` transaction already used throughout this codebase),
// so a rolled-back source event (e.g. a failed insert) always rolls its
// journal rows back with it — never an orphan journal.
//
// Rounding: every amount here is already a persisted 2-decimal-place value
// (numeric(_, 2) columns) by the time it reaches these functions, and no
// division ever occurs in this file, so no fractional residue can arise;
// if a future posting rule did need to split an amount, any residual cent
// must be accumulated into Other Expense (5400)/Sales Revenue, per the
// documented convention, rather than silently dropped.
// ---------------------------------------------------------------------------

const EXPENSE_ACCOUNT_CODE: Record<string, string> = { RENT: "5100", UTILITIES: "5200", MARKETING: "5300", OTHER: "5400" };

async function accountsByCode(tx: Executor): Promise<Map<string, string>> {
  const rows = await tx.select({ id: ledgerAccounts.id, code: ledgerAccounts.code }).from(ledgerAccounts).where(isNull(ledgerAccounts.branchId));
  return new Map(rows.map(r => [r.code, r.id]));
}
function requireAccount(byCode: Map<string, string>, code: string): string {
  const id = byCode.get(code);
  if (!id) throw new HttpError(409, `Chart of accounts not seeded: account ${code} missing. POST /api/accounts/balance-sheet as Owner first.`);
  return id;
}
/** Posts one balanced debit/credit journal row for a single "leg" of a
 * source event, or silently returns the existing row if this exact
 * (referenceType, referenceId, leg) was already posted — the real replay
 * guard. Skips (returns null) for a zero amount leg rather than posting a
 * meaningless 0.00 double-entry row. */
export async function postJournalLeg(tx: Executor, params: {
  branchId: string; description: string; debitAccountId: string; creditAccountId: string;
  amount: string; referenceType: string; referenceId: string; leg?: number; createdById: string | null;
}) {
  const { branchId, description, debitAccountId, creditAccountId, amount, referenceType, referenceId, createdById } = params;
  const leg = params.leg ?? 0;
  if (paise(amount) === 0n) return null;
  const [existing] = await tx.select().from(journalEntries)
    .where(and(eq(journalEntries.referenceType, referenceType), eq(journalEntries.referenceId, referenceId), eq(journalEntries.leg, leg))).limit(1);
  if (existing) return existing;
  const [row] = await tx.insert(journalEntries).values({
    id: randomUUID(), branchId, description, debitAccountId, creditAccountId, amount,
    referenceType, referenceId, leg, createdById,
  }).returning();
  return row;
}
/** Petty cash IN (HQ top-up/refund credit): Debit Cash, Credit Owner's
 * Equity. Petty cash entries have no "source" field beyond IN/OUT, and the
 * schema's own comment documents IN as "top-up from HQ" — Owner's Equity is
 * the one reasonable existing account for that without fabricating a new
 * concept. Petty cash OUT (branch expense): Debit Other Expense, Credit
 * Cash. Petty cash entries also carry no category field (only free-text
 * description), so the 1:1 RENT/UTILITIES/MARKETING/OTHER category mapping
 * used for /api/accounts/expenses cannot be applied here without guessing a
 * category from text — posting every petty cash OUT to Other Expense is the
 * one documented, consistent rule instead. Both directions use the approved
 * chart's "Cash" account (1000), never the separate legacy "Petty Cash"
 * (1010) sub-asset row. */
export async function postPettyCashJournal(tx: Executor, actor: Identity, entry: { id: string; branchId: string; entryType: "IN" | "OUT"; amount: string }) {
  const byCode = await accountsByCode(tx);
  const cash = requireAccount(byCode, "1000");
  if (entry.entryType === "IN") {
    const equity = requireAccount(byCode, "3000");
    return postJournalLeg(tx, { branchId: entry.branchId, description: "Petty cash top-up", debitAccountId: cash, creditAccountId: equity, amount: entry.amount, referenceType: "PETTY_CASH_IN", referenceId: entry.id, createdById: actor.id });
  }
  const otherExpense = requireAccount(byCode, "5400");
  return postJournalLeg(tx, { branchId: entry.branchId, description: "Petty cash expense", debitAccountId: otherExpense, creditAccountId: cash, amount: entry.amount, referenceType: "PETTY_CASH_OUT", referenceId: entry.id, createdById: actor.id });
}
/** Accounts expense posting (/api/accounts/expenses POST): Debit the
 * category's mapped Expense account, Credit Accounts Payable — NOT Cash.
 * Rule (documented, single and consistent): this endpoint records a vendor/
 * branch expense being recognized, not a cash disbursement event on its own
 * — petty cash OUT (postPettyCashJournal above) is the dedicated cash-
 * settlement path for branch expenses actually paid from the till. Keeping
 * the two event types financially distinct (branchExpenses always credits
 * Accounts Payable; pettyCashEntries OUT always credits Cash) avoids
 * guessing a payment method from free text and avoids double-crediting Cash
 * for the same real-world expense if a branch later also logs a petty cash
 * OUT for it. */
export async function postExpenseJournal(tx: Executor, actor: Identity, expense: { id: string; branchId: string; category: string; amount: string }) {
  const byCode = await accountsByCode(tx);
  const expenseCode = EXPENSE_ACCOUNT_CODE[expense.category];
  if (!expenseCode) throw new HttpError(409, `No chart-of-accounts mapping for expense category ${expense.category}`);
  const debit = requireAccount(byCode, expenseCode), payable = requireAccount(byCode, "2000");
  return postJournalLeg(tx, { branchId: expense.branchId, description: "Branch expense posted", debitAccountId: debit, creditAccountId: payable, amount: expense.amount, referenceType: "EXPENSE", referenceId: expense.id, createdById: actor.id });
}
/** Voided expense: an EXACT reversing entry (debit/credit swapped vs the
 * original posting), keyed as a separate reference type ("EXPENSE_VOID")
 * against the same expense id — the original EXPENSE journal row is never
 * mutated or deleted (immutable audit trail, same principle as GRN/payroll
 * elsewhere in this codebase). */
export async function postExpenseVoidJournal(tx: Executor, actor: Identity, expense: { id: string; branchId: string; category: string; amount: string }) {
  const [original] = await tx.select().from(journalEntries)
    .where(and(eq(journalEntries.referenceType, "EXPENSE"), eq(journalEntries.referenceId, expense.id), eq(journalEntries.leg, 0))).limit(1);
  // Legacy expenses predate journal posting: void the source without inventing
  // a reversal of a debit/credit that never existed.
  if (!original) return null;
  return postJournalLeg(tx, { branchId: original.branchId, description: "Reversal of voided branch expense", debitAccountId: original.creditAccountId, creditAccountId: original.debitAccountId, amount: original.amount, referenceType: "EXPENSE_VOID", referenceId: expense.id, leg: original.leg, createdById: actor.id });
}
/** Finalized (FINAL, immutable) payroll run: Debit Salary Expense, Credit
 * Accounts Payable for the exact finalized total — payroll not yet
 * disbursed is a real liability, not cash paid out yet. Posted once per
 * payroll run id (payrollRuns has its own (branchId, month) uniqueness, so
 * this can only ever be reached once per branch/month in the first place —
 * see workforce.ts `payroll()`'s `if (run) return ...` early-exit on
 * replay — the journal-level idempotency key is defense in depth on top of
 * that). */
export async function postPayrollFinalizeJournal(tx: Executor, actor: Identity, run: { id: string; branchId: string }, totalAmount: string) {
  const byCode = await accountsByCode(tx);
  const salary = requireAccount(byCode, "5500"), payable = requireAccount(byCode, "2000");
  return postJournalLeg(tx, { branchId: run.branchId, description: "Payroll finalized", debitAccountId: salary, creditAccountId: payable, amount: totalAmount, referenceType: "PAYROLL_RUN", referenceId: run.id, createdById: actor.id });
}
/** Aggregator settlement (manual, server-computed netPayout): Debit Bank for
 * the netPayout actually due to be received (not Accounts Receivable — the
 * aggregator order record here IS the settlement itself, server-computed
 * from gross/commission/ads/refund, not a pending invoice awaiting
 * collection, so Bank is the more correct real-world account), Credit Sales
 * Revenue for the gross orderValue. The schema already separates
 * commissionAmount/adsAmount/refundPenalty from netPayout, so their combined
 * total (the gap between gross revenue and net cash) is debited to Other
 * Expense in a second leg — two legs because this table is single-debit/
 * single-credit per row; both legs credit Sales Revenue so the two rows
 * together still net to Debit Bank + Debit Other Expense = Credit Sales
 * Revenue = orderValue, i.e. debit totals always equal credit totals for
 * the event as a whole. */
export async function postAggregatorJournal(tx: Executor, actor: Identity, order: { id: string; branchId: string; commissionAmount: string; adsAmount: string; refundPenalty: string; netPayout: string }) {
  const byCode = await accountsByCode(tx);
  const bank = requireAccount(byCode, "1020"), revenue = requireAccount(byCode, "4000"), otherExpense = requireAccount(byCode, "5400");
  const deductions = decimal(paise(order.commissionAmount) + paise(order.adsAmount) + paise(order.refundPenalty));
  const net = await postJournalLeg(tx, { branchId: order.branchId, description: "Aggregator settlement net payout", debitAccountId: bank, creditAccountId: revenue, amount: order.netPayout, referenceType: "AGGREGATOR_ORDER", referenceId: order.id, leg: 0, createdById: actor.id });
  const fees = await postJournalLeg(tx, { branchId: order.branchId, description: "Aggregator commission/ads/refund penalty", debitAccountId: otherExpense, creditAccountId: revenue, amount: deductions, referenceType: "AGGREGATOR_ORDER", referenceId: order.id, leg: 1, createdById: actor.id });
  return { net, fees };
}

// ---------------------------------------------------------------------------
// Petty Cash Book
// ---------------------------------------------------------------------------

export const pettyCashColumns = {
  id: pettyCashEntries.id, branchId: pettyCashEntries.branchId, loggedById: pettyCashEntries.loggedById,
  entryType: pettyCashEntries.entryType, amount: pettyCashEntries.amount, description: pettyCashEntries.description,
  photoUrl: pettyCashEntries.photoUrl, dailyCapInr: pettyCashEntries.dailyCapInr,
  balanceAfterInr: pettyCashEntries.balanceAfterInr, entryDate: pettyCashEntries.entryDate,
};
export function parsePettyCashInput(input: Record<string, unknown>) {
  const fields = ["branchId", "entryType", "amount", "description", "photoUrl"];
  if (Object.keys(input).some(key => !fields.includes(key))) throw new HttpError(400, "Unexpected field");
  const branchId = text(input.branchId, "branchId", 1, 200);
  if (input.entryType !== "IN" && input.entryType !== "OUT") throw new HttpError(400, "Invalid entryType");
  const amount = positiveMoney(input.amount, "amount");
  const description = text(input.description, "description", 2, 500);
  const photoUrl = input.photoUrl === undefined || input.photoUrl === "" ? "" : text(input.photoUrl, "photoUrl", 1, 2000);
  return { branchId, entryType: input.entryType as "IN" | "OUT", amount, description, photoUrl };
}
/** Balance is always re-derived from every real row for the branch (sum IN
 * minus sum OUT), never from "the last row read" — correct regardless of
 * row ordering, and safe inside the single advisory-lock mutate() transaction. */
export async function postPettyCashEntry(tx: Executor, actor: Identity, rawInput: Record<string, unknown>) {
  assertModule(actor, "PETTY_CASH");
  const input = parsePettyCashInput(rawInput);
  const branchId = branchScope(actor, input.branchId);
  if (!branchId) throw new HttpError(400, "Select a branch");
  await ensureLedgerBranch(tx, branchId);
  const [sums] = await tx.select({
    totalIn: sql<string>`coalesce(sum(case when ${pettyCashEntries.entryType} = 'IN' then ${pettyCashEntries.amount} else 0 end), 0)`,
    totalOut: sql<string>`coalesce(sum(case when ${pettyCashEntries.entryType} = 'OUT' then ${pettyCashEntries.amount} else 0 end), 0)`,
  }).from(pettyCashEntries).where(eq(pettyCashEntries.branchId, branchId));
  const prevBalance = paise(sums.totalIn) - paise(sums.totalOut);
  const delta = paise(input.amount);
  const newBalance = input.entryType === "IN" ? prevBalance + delta : prevBalance - delta;
  if (newBalance < 0n) throw new HttpError(400, "Petty cash balance cannot go negative");
  const [row] = await tx.insert(pettyCashEntries).values({
    id: randomUUID(), branchId, loggedById: actor.id, entryType: input.entryType,
    amount: input.amount, description: input.description, photoUrl: input.photoUrl,
    balanceAfterInr: decimal(newBalance),
  }).returning(pettyCashColumns);
  await postPettyCashJournal(tx, actor, { id: row.id, branchId, entryType: input.entryType, amount: input.amount });
  return row;
}
export function pettyCashWindow(branchId: string | null, range: { start: Date; end: Date }) {
  return and(branchId ? eq(pettyCashEntries.branchId, branchId) : undefined, gte(pettyCashEntries.entryDate, range.start), lt(pettyCashEntries.entryDate, range.end));
}

// ---------------------------------------------------------------------------
// Aggregator (Swiggy/Zomato) Recon
// ---------------------------------------------------------------------------

export const AGGREGATOR_CHANNELS = ["SWIGGY", "ZOMATO"] as const;
export const aggregatorColumns = {
  id: aggregatorOrders.id, branchId: aggregatorOrders.branchId, channel: aggregatorOrders.channel,
  orderValue: aggregatorOrders.orderValue, commissionAmount: aggregatorOrders.commissionAmount,
  adsAmount: aggregatorOrders.adsAmount, refundPenalty: aggregatorOrders.refundPenalty,
  netPayout: aggregatorOrders.netPayout, orderDate: aggregatorOrders.orderDate,
};
export function parseAggregatorInput(input: Record<string, unknown>) {
  const fields = ["branchId", "channel", "orderValue", "commissionAmount", "adsAmount", "refundPenalty", "orderDate"];
  if (Object.keys(input).some(key => !fields.includes(key))) throw new HttpError(400, "Unexpected field");
  const branchId = text(input.branchId, "branchId", 1, 200);
  if (!(AGGREGATOR_CHANNELS as readonly unknown[]).includes(input.channel)) throw new HttpError(400, "Invalid channel");
  const orderValue = positiveMoney(input.orderValue, "orderValue");
  const commissionAmount = money(input.commissionAmount, "commissionAmount", "0.00");
  const adsAmount = money(input.adsAmount, "adsAmount", "0.00");
  const refundPenalty = money(input.refundPenalty, "refundPenalty", "0.00");
  const orderDate = ledgerDate(input.orderDate);
  return { branchId, channel: input.channel as "SWIGGY" | "ZOMATO", orderValue, commissionAmount, adsAmount, refundPenalty, orderDate };
}
/** netPayout is ALWAYS server-computed from the other 4 fields — a client-sent
 * netPayout is never trusted/accepted (it isn't even in the field allowlist). */
export async function postAggregatorOrder(tx: Executor, actor: Identity, rawInput: Record<string, unknown>) {
  assertModule(actor, "AGGREGATOR_RECON");
  const input = parseAggregatorInput(rawInput);
  const branchId = branchScope(actor, input.branchId);
  if (!branchId) throw new HttpError(400, "Select a branch");
  await ensureLedgerBranch(tx, branchId);
  const netPayout = decimal(paise(input.orderValue) - paise(input.commissionAmount) - paise(input.adsAmount) - paise(input.refundPenalty));
  const [row] = await tx.insert(aggregatorOrders).values({
    id: randomUUID(), branchId, channel: input.channel, orderValue: input.orderValue,
    commissionAmount: input.commissionAmount, adsAmount: input.adsAmount, refundPenalty: input.refundPenalty,
    netPayout, orderDate: input.orderDate,
  }).returning(aggregatorColumns);
  await postAggregatorJournal(tx, actor, { id: row.id, branchId, commissionAmount: input.commissionAmount, adsAmount: input.adsAmount, refundPenalty: input.refundPenalty, netPayout });
  return row;
}
export function aggregatorWindow(branchId: string | null, range: { start: Date; end: Date }) {
  return and(branchId ? eq(aggregatorOrders.branchId, branchId) : undefined, gte(aggregatorOrders.orderDate, range.start), lt(aggregatorOrders.orderDate, range.end));
}
export function aggregatorTotals(rows: { orderValue: string; commissionAmount: string; adsAmount: string; refundPenalty: string; netPayout: string }[]) {
  const sum = (key: "orderValue" | "commissionAmount" | "adsAmount" | "refundPenalty" | "netPayout") => decimal(rows.reduce((s, r) => s + paise(r[key]), 0n));
  return { orderValue: sum("orderValue"), commissionAmount: sum("commissionAmount"), adsAmount: sum("adsAmount"), refundPenalty: sum("refundPenalty"), netPayout: sum("netPayout") };
}

// ---------------------------------------------------------------------------
// Balance Sheet — real aggregation over ledgerAccounts + journalEntries.
// The chart of accounts (ledgerAccounts) is seeded as HQ-level rows
// (branchId = null) because `code` is globally unique in the schema, not
// unique-per-branch — one shared chart, branch-scoped journal entries on top
// of it. See `seedLedgerAccounts` for exactly what it creates.
// ---------------------------------------------------------------------------

export const SEED_LEDGER_ACCOUNTS = [
  { code: "1000", name: "Cash", type: "ASSET" as const },
  { code: "1010", name: "Petty Cash", type: "ASSET" as const }, // legacy sub-asset row, kept but unused by journal postings below (see FINANCE-1 notes)
  { code: "1020", name: "Bank", type: "ASSET" as const },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" as const },
  { code: "2100", name: "VAT Payable", type: "LIABILITY" as const }, // 18% Tanzania VAT, not GST/GSTR
  { code: "3000", name: "Owner's Equity", type: "EQUITY" as const },
  { code: "4000", name: "Sales Revenue", type: "INCOME" as const },
  { code: "5000", name: "Purchases/COGS", type: "EXPENSE" as const },
  { code: "5100", name: "Rent Expense", type: "EXPENSE" as const },
  { code: "5200", name: "Utilities Expense", type: "EXPENSE" as const },
  { code: "5300", name: "Marketing Expense", type: "EXPENSE" as const },
  { code: "5400", name: "Other Expense", type: "EXPENSE" as const },
  { code: "5500", name: "Salary Expense", type: "EXPENSE" as const },
];
/** Idempotent: inserts the 13 standard HQ-level accounts only if their code
 * doesn't already exist (onConflictDoNothing on the unique `code` column).
 * 12 of these are the user-approved FINANCE-1 chart of accounts (Cash, Bank,
 * Sales Revenue, Purchases/COGS, VAT Payable, Accounts Payable, Rent/
 * Utilities/Marketing/Other/Salary Expense, Owner's Equity); "1010 Petty
 * Cash" is an earlier, separate sub-asset row kept for backward compatibility
 * but deliberately NOT used by any of the real journal postings added in
 * FINANCE-1 — those always debit/credit "1000 Cash" for petty cash events,
 * matching the approved chart (see postPettyCashJournal). */
export async function seedLedgerAccounts(tx: Executor) {
  const inserted = await tx.insert(ledgerAccounts)
    .values(SEED_LEDGER_ACCOUNTS.map(a => ({ id: randomUUID(), code: a.code, name: a.name, type: a.type, branchId: null })))
    .onConflictDoNothing({ target: ledgerAccounts.code })
    .returning({ code: ledgerAccounts.code });
  return { created: inserted.map(r => r.code), accounts: SEED_LEDGER_ACCOUNTS.map(a => a.code) };
}
const BALANCE_SHEET_NOTES = [
  "Real aggregation from ledger_accounts + journal_entries only — no hardcoded or estimated figures.",
  "The chart of accounts is HQ-level and shared across branches; journal entries are always branch-scoped.",
  "INCOME and EXPENSE account balances are rolled up into a single synthetic \"Retained Earnings (Net Income)\" Equity line (net income = total INCOME minus total EXPENSE) so Assets = Liabilities + Equity holds for real FINANCE-1 postings — this line has no ledger_accounts row of its own and is never a journal entry target; it is the standard trial-balance-to-balance-sheet closing step, computed fresh on every read, never persisted/fabricated.",
];
export async function computeBalanceSheet(tx: Executor, branchId: string) {
  const accounts = await tx.select().from(ledgerAccounts).where(or(eq(ledgerAccounts.branchId, branchId), isNull(ledgerAccounts.branchId)));
  const zeroTotals = { asset: "0.00", liability: "0.00", equity: "0.00" };
  if (!accounts.length) {
    return { branchId, seeded: false, assets: [], liabilities: [], equity: [], totals: zeroTotals, balanced: true,
      notes: [...BALANCE_SHEET_NOTES, "No ledger accounts exist yet for this branch or HQ-level — nothing to aggregate; these are real zeros, not a fabricated balance. Seed the chart of accounts first (POST this same endpoint as Owner)."] };
  }
  const entries = await tx.select({ debitAccountId: journalEntries.debitAccountId, creditAccountId: journalEntries.creditAccountId, amount: journalEntries.amount })
    .from(journalEntries).where(eq(journalEntries.branchId, branchId));
  // Raw net is always "debit minus credit". ASSET/EXPENSE accounts have a
  // normal debit balance, so that raw value IS the amount to display.
  // LIABILITY/EQUITY/INCOME accounts have a normal CREDIT balance, so the
  // sign must flip for them to show as a positive balance when credited
  // (e.g. a 1000 credit to Owner's Equity must display as +1000 equity, not
  // -1000) — this is standard double-entry convention, not a fabricated flip.
  const net = new Map<string, bigint>(accounts.map(a => [a.id, 0n]));
  for (const entry of entries) {
    net.set(entry.debitAccountId, (net.get(entry.debitAccountId) ?? 0n) + paise(entry.amount));
    net.set(entry.creditAccountId, (net.get(entry.creditAccountId) ?? 0n) - paise(entry.amount));
  }
  const creditNormal = (type: string) => type === "LIABILITY" || type === "EQUITY" || type === "INCOME";
  const rows = accounts.filter(a => a.isActive).map(a => {
    const raw = net.get(a.id) ?? 0n;
    return { id: a.id, code: a.code, name: a.name, type: a.type, amountInr: decimal(creditNormal(a.type) ? -raw : raw) };
  }).sort((a, b) => a.code.localeCompare(b.code));
  const section = (type: string) => rows.filter(r => r.type === type);
  const sumSection = (sectionRows: typeof rows) => decimal(sectionRows.reduce((s, r) => s + paise(r.amountInr), 0n));
  const assets = section("ASSET"), liabilities = section("LIABILITY");
  // Net income = total INCOME minus total EXPENSE (both already displayed as
  // positive-normal-balance amounts above) — the real double-entry fact that
  // closes every INCOME/EXPENSE account into Equity at period end, so a real
  // posted expense/revenue journal never silently breaks Assets = Liabilities
  // + Equity just because this chart keeps Income/Expense as separate rows
  // instead of a persisted retained-earnings account.
  const netIncome = decimal(paise(sumSection(section("INCOME"))) - paise(sumSection(section("EXPENSE"))));
  const equity = [...section("EQUITY"), { id: "", code: "3900", name: "Retained Earnings (Net Income)", type: "EQUITY" as const, amountInr: netIncome }].sort((a, b) => a.code.localeCompare(b.code));
  const totals = { asset: sumSection(assets), liability: sumSection(liabilities), equity: sumSection(equity) };
  const balanced = paise(totals.asset) === paise(totals.liability) + paise(totals.equity);
  return { branchId, seeded: true, assets, liabilities, equity, totals, balanced, notes: BALANCE_SHEET_NOTES };
}
