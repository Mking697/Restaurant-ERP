import { sql } from "drizzle-orm";
import { check, date, index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";

export const expenseCategoryEnum = pgEnum("expense_category", ["RENT", "UTILITIES", "MARKETING", "OTHER"]);
export const expenseStatusEnum = pgEnum("expense_status", ["POSTED", "VOID"]);
// Business fields never change through the API. Voiding retains the original entry
// and records actor, timestamp and reason on that same immutable-history record.
export const branchExpenses = pgTable("branch_expenses", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  date: date("date").notNull(),
  category: expenseCategoryEnum("category").notNull(),
  subcategory: text("subcategory").notNull().default(""),
  amount: numeric("amount", { precision: 11, scale: 2 }).notNull(),
  description: text("description").notNull(),
  reference: text("reference").notNull(),
  status: expenseStatusEnum("status").notNull().default("POSTED"),
  // GAP-035: how this expense was actually paid. "" (unspecified/legacy —
  // the pre-existing default, never touches drawer cash), "CASH" (a real
  // physical drawer outflow — shiftRunId below is then required and
  // resolved server-side, never client-supplied), "NON_CASH" (bank/card/
  // other — explicit, still never touches drawer cash).
  paymentMethod: text("payment_method").notNull().default(""),
  // Non-empty only when paymentMethod='CASH' — the specific shift run this
  // cash left the drawer under. Shift-close subtracts POSTED CASH expenses
  // for this exact run from expected cash, exactly once; a VOIDed one is
  // excluded live, and a run that has already ended/closed is never a
  // valid target (the server only ever resolves the CURRENTLY open run).
  shiftRunId: text("shift_run_id").notNull().default(""),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  createdById: text("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidReason: text("void_reason"),
  voidedById: text("voided_by_id").references(() => users.id),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
}, table => [
  uniqueIndex("expenses_branch_actor_key_unique").on(table.branchId, table.createdById, table.idempotencyKey),
  index("expenses_branch_date_idx").on(table.branchId, table.date),
  check("expenses_amount_positive", sql`${table.amount} > 0`),
  check("expenses_void_audit", sql`(${table.status} = 'POSTED' and ${table.voidReason} is null and ${table.voidedById} is null and ${table.voidedAt} is null) or (${table.status} = 'VOID' and ${table.voidReason} is not null and length(trim(${table.voidReason})) >= 3 and ${table.voidedById} is not null and ${table.voidedAt} is not null)`),
  check("expenses_payment_method_valid", sql`${table.paymentMethod} in ('', 'CASH', 'NON_CASH')`),
  check("expenses_cash_requires_shift_run", sql`(${table.paymentMethod} = 'CASH' and ${table.shiftRunId} <> '') or (${table.paymentMethod} <> 'CASH' and ${table.shiftRunId} = '')`),
]);
