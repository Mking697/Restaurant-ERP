import { boolean, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { menuItems } from "./menu";
import { users } from "./auth";

export const orderChannelEnum = pgEnum("order_channel", ["DINE_IN", "TAKEAWAY", "SWIGGY", "ZOMATO"]);
export const orderStatusEnum = pgEnum("order_status", ["COMPLETED", "VOIDED"]);

export const posOrders = pgTable(
  "pos_orders",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    orderNumber: text("order_number").notNull(),
    channel: orderChannelEnum("channel").notNull(),
    tableNo: text("table_no").notNull().default(""),
    // 2 billing counters per branch (confirmed scope). Validated at the API
    // layer against POS_COUNTERS — plain text, not an enum, so adding a 3rd
    // counter later is additive, no enum-migration needed.
    counterNo: text("counter_no").notNull().default("COUNTER_1"),
    // Optional — captured when the cashier types it in for the WhatsApp
    // Thank You message / Offer Alert targeting (src/lib/server/whatsapp-
    // triggers.ts). Empty means "no WhatsApp contact for this order", never
    // required to complete a sale.
    customerPhone: text("customer_phone").notNull().default(""),
    customerName: text("customer_name").notNull().default(""),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
    // Multi-currency (confirmed scope: NRI/export billing). totalAmount
    // above is ALWAYS the VAT invoice-of-record in INR — these three
    // columns are an optional "what the customer actually paid in their
    // currency" snapshot, locked in at sale time from currency_rates, never
    // recomputed later even if the rate changes afterwards.
    tenderCurrencyCode: text("tender_currency_code").notNull().default("INR"),
    fxRateToInr: numeric("fx_rate_to_inr", { precision: 12, scale: 6 }).notNull().default("1.000000"),
    tenderCurrencyAmount: numeric("tender_currency_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    tenderType: text("tender_type").notNull(), // CASH, UPI, CARD, SWIGGY, ZOMATO
    status: orderStatusEnum("status").notNull().default("COMPLETED"),
    // Operational confidentiality only. Never exclude this order from tax,
    // inventory or actual cash reconciliation because of this flag.
    ownerOnly: boolean("owner_only").notNull().default(false),
    voidReason: text("void_reason").notNull().default(""),
    cashierId: text("cashier_id")
      .notNull()
      .references(() => users.id),
    // Which operational shift run (src/db/schema/shifts.ts) this order fell
    // under — plain text, not a FK, so pos.ts never needs to import
    // shifts.ts (shifts.ts already imports pos.ts for cashDrops, avoiding a
    // circular module dependency). Empty string means "no shift system
    // configured for this branch yet" — legacy/back-compat, never blocks a
    // sale on its own.
    shiftRunId: text("shift_run_id").notNull().default(""),
    // Real cost of goods sold for THIS order, captured ONCE at order-confirm
    // time via src/lib/server/cogs.ts (recursive BOM explosion down to raw
    // materials, priced at the latest locked vendor rate at that moment) —
    // never recomputed retroactively. cogsComplete=false means at least one
    // sold line's cost couldn't be fully priced (a nested Semi-FG with no
    // saved recipe, or a raw material with no vendor rate ever locked); in
    // that case cogsAmount is only the PARTIAL sum of what was priceable and
    // must not be trusted as the order's real cost — Accounts P&L excludes
    // the whole period's gross profit rather than understate it when any
    // completed order in that period has cogsComplete=false.
    cogsAmount: numeric("cogs_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    cogsComplete: boolean("cogs_complete").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("pos_orders_branch_order_number_unique").on(table.branchId, table.orderNumber),
    index("pos_orders_branch_created_idx").on(table.branchId, table.createdAt),
    index("pos_orders_shift_run_id_idx").on(table.shiftRunId),
  ]
);

export const posOrderLines = pgTable("pos_order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => posOrders.id),
  menuItemId: text("menu_item_id")
    .notNull()
    .references(() => menuItems.id),
  qty: integer("qty").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const posAlerts = pgTable(
  "pos_alerts",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => posOrders.id),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    alertType: text("alert_type").notNull(), // VOID, HIGH_DISCOUNT
    reason: text("reason").notNull().default(""),
    sentToOwner: boolean("sent_to_owner").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pos_alerts_branch_id_idx").on(table.branchId)]
);

export const cashDrops = pgTable(
  "cash_drops",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    cashierId: text("cashier_id")
      .notNull()
      .references(() => users.id),
    shiftDate: timestamp("shift_date", { withTimezone: true }).notNull(),
    // Hidden from cashier UI until submit — API-layer rule, not enforceable in schema.
    expectedCashInr: numeric("expected_cash_inr", { precision: 10, scale: 2 }).notNull(),
    note500Count: integer("note_500_count").notNull().default(0),
    note200Count: integer("note_200_count").notNull().default(0),
    note100Count: integer("note_100_count").notNull().default(0),
    note50Count: integer("note_50_count").notNull().default(0),
    note20Count: integer("note_20_count").notNull().default(0),
    note10Count: integer("note_10_count").notNull().default(0),
    coinsInr: numeric("coins_inr", { precision: 10, scale: 2 }).notNull().default("0"),
    countedCashInr: numeric("counted_cash_inr", { precision: 10, scale: 2 }).notNull(), // computed
    shortageExcessInr: numeric("shortage_excess_inr", { precision: 10, scale: 2 }).notNull(),
    // Which shift run (src/db/schema/shifts.ts) this count was taken for —
    // plain text (see pos_orders.shiftRunId comment for why, same reason).
    // Set when this drop is the CLOSING count submitted as part of ending a
    // shift; empty for an ordinary mid-shift/off-cycle cash count.
    shiftRunId: text("shift_run_id").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cash_drops_branch_cashier_shift_unique").on(
      table.branchId,
      table.cashierId,
      table.shiftDate
    ),
    index("cash_drops_branch_id_idx").on(table.branchId),
    index("cash_drops_shift_run_id_idx").on(table.shiftRunId),
  ]
);

export const employeeLedger = pgTable(
  "employee_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    entryType: text("entry_type").notNull(), // SHORTAGE_DEBIT, ADJUSTMENT
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    referenceCashDropId: text("reference_cash_drop_id").references(() => cashDrops.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("employee_ledger_user_id_idx").on(table.userId), index("employee_ledger_branch_id_idx").on(table.branchId)]
);
