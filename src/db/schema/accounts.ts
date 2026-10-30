import { boolean, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// PETTY CASH BOOK — IN (top-up from HQ) / OUT (expense), running balance
// stored at write time so the book reads back as an immutable ledger instead
// of being recomputed differently depending on which rows happen to load.
// ---------------------------------------------------------------------------

export const pettyCashEntryTypeEnum = pgEnum("petty_cash_entry_type", ["IN", "OUT"]);

export const pettyCashEntries = pgTable(
  "petty_cash_entries",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    loggedById: text("logged_by_id")
      .notNull()
      .references(() => users.id),
    entryType: pettyCashEntryTypeEnum("entry_type").notNull().default("OUT"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    description: text("description").notNull(), // parsed WhatsApp caption, e.g. "Milk"
    photoUrl: text("photo_url").notNull().default(""),
    waMessageId: text("wa_message_id").notNull().default(""),
    dailyCapInr: numeric("daily_cap_inr", { precision: 10, scale: 2 }).notNull().default("2000"),
    // Branch's petty cash balance immediately after this entry posted — an
    // append-only running total, not recomputed on every read.
    balanceAfterInr: numeric("balance_after_inr", { precision: 10, scale: 2 }).notNull().default("0"),
    entryDate: timestamp("entry_date", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("petty_cash_branch_date_idx").on(table.branchId, table.entryDate)]
);

export const aggregatorOrders = pgTable(
  "aggregator_orders",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    channel: text("channel").notNull(), // SWIGGY, ZOMATO
    orderValue: numeric("order_value", { precision: 10, scale: 2 }).notNull(),
    commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    adsAmount: numeric("ads_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    refundPenalty: numeric("refund_penalty", { precision: 10, scale: 2 }).notNull().default("0"),
    netPayout: numeric("net_payout", { precision: 10, scale: 2 }).notNull(),
    orderDate: timestamp("order_date", { withTimezone: true }).notNull(),
  },
  (table) => [index("aggregator_orders_branch_date_idx").on(table.branchId, table.orderDate)]
);

export const branchFinancials = pgTable(
  "branch_financials",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    revenue: numeric("revenue", { precision: 14, scale: 2 }).notNull(),
    cogs: numeric("cogs", { precision: 14, scale: 2 }).notNull(), // food cost
    laborCost: numeric("labor_cost", { precision: 14, scale: 2 }).notNull(),
    primeCost: numeric("prime_cost", { precision: 14, scale: 2 }).notNull(), // cogs + labor
    primeCostPercent: numeric("prime_cost_percent", { precision: 5, scale: 2 }).notNull(),
  },
  (table) => [index("branch_financials_branch_period_idx").on(table.branchId, table.periodStart)]
);

// ---------------------------------------------------------------------------
// CHART OF ACCOUNTS + JOURNAL — a minimal real double-entry backbone so
// Balance Sheet and P&L are genuine aggregations, not separately-typed-in
// numbers that can silently disagree with the rest of the books. Scoped
// deliberately small (no sub-ledgers, no multi-currency, no accounting
// periods/locking) — this is "enough structure to be honest", not a full
// general-ledger product; extend it if/when the brief asks for more.
// ---------------------------------------------------------------------------

export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
]);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(), // e.g. "1000" Cash, "4000" Sales Revenue
    name: text("name").notNull(),
    type: ledgerAccountTypeEnum("type").notNull(),
    branchId: text("branch_id").references(() => branches.id), // null = HQ-level account
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [index("ledger_accounts_branch_id_idx").on(table.branchId)]
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    entryDate: timestamp("entry_date", { withTimezone: true }).notNull().defaultNow(),
    description: text("description").notNull(),
    debitAccountId: text("debit_account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    creditAccountId: text("credit_account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Polymorphic pointer back to whatever posted this (PettyCashEntry,
    // MaterialReturn, POSOrder settlement, VendorInvoice payment, ...) —
    // deliberately not an FK, same convention as whatsAppMessageLog.
    referenceType: text("reference_type").notNull().default(""),
    referenceId: text("reference_id").notNull().default(""),
    // A single source event (e.g. one aggregator settlement) can require more
    // than one balanced debit/credit row (this table is single-debit/single-
    // credit per row, not a multi-line journal) — `leg` distinguishes those
    // rows for the SAME event (0, 1, 2, ...). Combined with
    // (referenceType, referenceId) this is the real replay-safety key: a
    // retried/duplicated event POST can never double-post the same leg twice
    // (see journal_entries_posting_key_unique below), matching the existing
    // idempotency convention used by GRN posting and recurring task
    // generation elsewhere in this codebase.
    leg: integer("leg").notNull().default(0),
    createdById: text("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("journal_entries_branch_date_idx").on(table.branchId, table.entryDate),
    index("journal_entries_reference_idx").on(table.referenceType, table.referenceId),
    uniqueIndex("journal_entries_posting_key_unique").on(table.referenceType, table.referenceId, table.leg),
  ]
);
