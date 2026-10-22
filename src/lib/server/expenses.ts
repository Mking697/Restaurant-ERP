import { createHash } from "node:crypto";
import { branchScope, hasModule, HttpError, type Identity } from "./permissions";

export function expensePermission(actor: Identity, aggregate = false) {
  if (!hasModule(actor, "ACCOUNTS_EXPENSES") && !(aggregate && hasModule(actor, "PAYROLL"))) throw new HttpError(403, "Module access required");
}
export function expenseScope(actor: Identity, requested?: unknown, write = false) {
  const selected = requested === null || requested === undefined || requested === "" ? null : text(requested, "branchId", 1, 200);
  const scope = branchScope(actor, selected);
  if (write && !scope) throw new HttpError(400, "Select a branch");
  return scope;
}

export const EXPENSE_CATEGORIES = ["RENT", "UTILITIES", "MARKETING", "OTHER"] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length > max || value.trim().length < min || /[\u0000-\u001f\u007f]/.test(value)) throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}
export function expenseDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9998-12-31") throw new HttpError(400, "Invalid date");
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpError(400, "Invalid date");
  return value;
}
export function expenseMonth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new HttpError(400, "Invalid month");
  const start = expenseDate(value + "-01");
  const next = new Date(start + "T00:00:00.000Z"); next.setUTCMonth(next.getUTCMonth() + 1);
  return { month: value, start, end: next.toISOString().slice(0, 10) };
}
export function assertExpenseReplay(existing: { requestFingerprint: string }, input: { requestFingerprint: string }) {
  if (existing.requestFingerprint !== input.requestFingerprint) throw new HttpError(409, "Idempotency key already used with a different payload");
}
export function voidExpenseChanges(existing: { status: string }, input: Record<string, unknown>, actor: Identity, now = new Date()) {
  if (Object.keys(input).some(key => key !== "reason")) throw new HttpError(400, "Only reason is allowed");
  const voidReason = text(input.reason, "reason", 3, 500);
  if (existing.status !== "POSTED") throw new HttpError(409, "Expense already voided");
  return { status: "VOID" as const, voidReason, voidedById: actor.id, voidedAt: now };
}
type CostRow = { category: ExpenseCategory; amount: string; status: "POSTED" | "VOID" };
function paise(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Invalid persisted money");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
function decimal(value: bigint) { return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`; }
export function expenseProfitLoss(month: string, rows: CostRow[], finalizedPayroll: { amount: string }[]) {
  expenseMonth(month);
  const sums: Record<ExpenseCategory, bigint> = { RENT: BigInt(0), UTILITIES: BigInt(0), MARKETING: BigInt(0), OTHER: BigInt(0) };
  for (const row of rows) if (row.status === "POSTED") {
    if (!EXPENSE_CATEGORIES.includes(row.category)) throw new Error("Invalid persisted category");
    sums[row.category] += paise(row.amount);
  }
  const labor = finalizedPayroll.reduce((sum, row) => sum + paise(row.amount), BigInt(0));
  const expenses = { RENT: decimal(sums.RENT), UTILITIES: decimal(sums.UTILITIES), MARKETING: decimal(sums.MARKETING), OTHER: decimal(sums.OTHER) };
  return { month, expenses, laborCost: decimal(labor), totalOperatingExpenses: decimal(Object.values(sums).reduce((sum, amount) => sum + amount, labor)), revenue: null, cogs: null, grossProfit: null, netProfit: null, salesConnected: false,
    notes: ["Expense-side report only: revenue and COGS are not connected; gross and net profit are unavailable.", "Posted branch expenses are summed by expense date; voided expenses are excluded. No mock figures are used.", "Labor includes immutable finalized monthly payroll snapshots only, never draft previews; no money transfer is implied.", "Either Accounts Expenses or Payroll grant permits same-scope category and labor aggregates. Individual expense records require Accounts Expenses access."] };
}
export function parseExpense(input: Record<string, unknown>) {
  const fields = ["branchId", "date", "category", "subcategory", "amount", "description", "reference", "idempotencyKey"];
  if (Object.keys(input).some(key => !fields.includes(key))) throw new HttpError(400, "Unexpected expense field");
  const branchId = text(input.branchId, "branchId", 1, 200), date = expenseDate(input.date);
  if (!(EXPENSE_CATEGORIES as readonly unknown[]).includes(input.category)) throw new HttpError(400, "Invalid category");
  if (typeof input.amount !== "string" || !/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(input.amount)) throw new HttpError(400, "Invalid amount (maximum 999999999.99)");
  const [whole, fraction = ""] = input.amount.split(".");
  const amount = whole + "." + fraction.padEnd(2, "0");
  if (amount === "0.00") throw new HttpError(400, "Amount must be positive");
  const description = text(input.description, "description", 3, 500), reference = text(input.reference, "reference", 2, 120);
  if (!/[\p{L}\p{N}]/u.test(description)) throw new HttpError(400, "Enter a useful expense description");
  const subcategory = input.subcategory === undefined || input.subcategory === "" ? "" : text(input.subcategory, "subcategory", 1, 80);
  const idempotencyKey = text(input.idempotencyKey, "idempotencyKey", 8, 128);
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey) || idempotencyKey !== input.idempotencyKey) throw new HttpError(400, "Invalid idempotencyKey");
  // Fixed field order ignores JSON property order but preserves exact submitted values,
  // including decimal spelling, whitespace and omitted versus empty optional fields.
  const requestFingerprint = createHash("sha256").update(JSON.stringify(fields.filter(k => k !== "idempotencyKey" && Object.hasOwn(input, k)).map(k => [k, input[k]]))).digest("hex");
  return { branchId, date, category: input.category as ExpenseCategory, subcategory, amount, description, reference, idempotencyKey, requestFingerprint };
}
