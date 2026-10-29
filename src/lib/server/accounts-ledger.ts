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
// gst.ts) rather than a cross-module dependency.
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
  { code: "1010", name: "Petty Cash", type: "ASSET" as const },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" as const },
  { code: "3000", name: "Owner's Equity", type: "EQUITY" as const },
  { code: "4000", name: "Sales Revenue", type: "INCOME" as const },
  { code: "5000", name: "COGS", type: "EXPENSE" as const },
];
/** Idempotent: inserts the 6 standard HQ-level accounts only if their code
 * doesn't already exist (onConflictDoNothing on the unique `code` column).
 * Creates ONLY chart-of-accounts rows, never fabricates journal entries —
 * real transaction postings are explicitly out of scope for this pass. */
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
  "INCOME/EXPENSE accounts exist in the chart for future use but are not part of this Assets = Liabilities + Equity view.",
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
  const assets = section("ASSET"), liabilities = section("LIABILITY"), equity = section("EQUITY");
  const totals = { asset: sumSection(assets), liability: sumSection(liabilities), equity: sumSection(equity) };
  const balanced = paise(totals.asset) === paise(totals.liability) + paise(totals.equity);
  return { branchId, seeded: true, assets, liabilities, equity, totals, balanced, notes: BALANCE_SHEET_NOTES };
}
