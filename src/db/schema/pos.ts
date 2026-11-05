import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches, branchOperatingConceptEnum } from "./platform";
import { menuItems } from "./menu";
import { users } from "./auth";

export const orderChannelEnum = pgEnum("order_channel", ["DINE_IN", "TAKEAWAY", "SWIGGY", "ZOMATO"]);
export const orderStatusEnum = pgEnum("order_status", ["OPEN", "PAID", "COMPLETED", "VOIDED"]);
export const posAttemptActionEnum = pgEnum("pos_attempt_action", ["CREATE", "ADD_LINES", "SETTLE"]);
export const posTicketStationEnum = pgEnum("pos_ticket_station", ["KITCHEN", "BAR"]);

export const posOrders = pgTable(
  "pos_orders",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    orderNumber: text("order_number").notNull(),
    channel: orderChannelEnum("channel").notNull(),
    // Snapshot the branch concept used when this order was admitted. Changing a
    // branch later must not strand an already-open conventional table order.
    operatingConcept: branchOperatingConceptEnum("operating_concept").notNull().default("FAST_FOOD"),
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
    tenderType: text("tender_type").notNull().default(""), // empty while conventional dine-in remains OPEN
    // Preserve the historical direct-insert default. Lifecycle writers explicitly
    // set OPEN/PAID after the additive enum migration has committed.
    status: orderStatusEnum("status").notNull().default("COMPLETED"),
    // Legacy rows are not silently represented as lifecycle-verified orders.
    serviceStatus: text("service_status").notNull().default("LEGACY"),
    revision: integer("revision").notNull().default(1),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    stockDeductedAt: timestamp("stock_deducted_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    // Operational confidentiality only. Never exclude this order from tax,
    // inventory or actual cash reconciliation because of this flag.
    ownerOnly: boolean("owner_only").notNull().default(false),
    paymentCaptured: boolean("payment_captured").notNull().default(false),
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
    // Fail closed for writers that omit cost capture. Only the POS capture
    // path may explicitly mark a cost complete, including a genuine zero.
    cogsComplete: boolean("cogs_complete").notNull().default(false),
    // GAP-029: the customer-facing takeaway pickup number — distinct from
    // `id` (internal identity) and from any statutory invoice number
    // (pos_documents.number). Empty string means "no pickup token applies
    // to this order" (every DINE_IN table order, and legacy rows). Never
    // renumbered after assignment, including on void.
    pickupToken: text("pickup_token").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("pos_orders_branch_order_number_unique").on(table.branchId, table.orderNumber),
    index("pos_orders_branch_created_idx").on(table.branchId, table.createdAt),
    index("pos_orders_shift_run_id_idx").on(table.shiftRunId),
  ]
);

// GAP-029: an atomic, branch/business-day/channel-scoped pickup token
// counter. lastValue only ever increases per scope row — a cancelled/
// voided order never frees or reuses its number, and the scope (business
// day resets, branch is isolated) is exactly the unique key below.
export const posTokenSequences = pgTable(
  "pos_token_sequences",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    businessDate: text("business_date").notNull(), // "YYYY-MM-DD", Tanzania EAT calendar day
    channel: orderChannelEnum("channel").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (table) => [uniqueIndex("pos_token_sequences_scope_unique").on(table.branchId, table.businessDate, table.channel)]
);

export const posOrderLines = pgTable(
  "pos_order_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => posOrders.id),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id),
    // NULL denotes unknown legacy data; a blank code is a captured blank.
    nameSnapshot: text("name_snapshot"),
    productCodeSnapshot: text("product_code_snapshot"),
    qty: integer("qty").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    // Null only for legacy rows created before per-line tax snapshots existed;
    // reports then fall back to the existing branch/item tax configuration.
    vatRatePercent: numeric("vat_rate_percent", { precision: 5, scale: 2 }),
  },
  (table) => [index("pos_order_lines_order_id_idx").on(table.orderId)]
);

export const posOrderAttempts = pgTable("pos_order_attempts", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  orderId: text("order_id").notNull().references(() => posOrders.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull().references(() => users.id),
  action: posAttemptActionEnum("action").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestJson: jsonb("request_json").notNull(),
  responseJson: jsonb("response_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("pos_order_attempts_branch_key_unique").on(table.branchId, table.idempotencyKey), index("pos_order_attempts_order_idx").on(table.orderId)]);

export const posProductionTickets = pgTable("pos_production_tickets", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => posOrders.id, { onDelete: "cascade" }),
  branchId: text("branch_id").notNull().references(() => branches.id),
  station: posTicketStationEnum("station").notNull(),
  ticketNumber: text("ticket_number").notNull(),
  status: text("status").notNull().default("SENT"),
  revision: integer("revision").notNull().default(1),
  // Null means no historical snapshot exists; never reconstruct from catalog.
  snapshotLines: jsonb("snapshot_lines"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("pos_production_tickets_number_unique").on(table.branchId, table.ticketNumber), index("pos_production_tickets_order_idx").on(table.orderId)]);

export const posProductionTicketLines = pgTable("pos_production_ticket_lines", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => posProductionTickets.id, { onDelete: "cascade" }),
  orderLineId: text("order_line_id").notNull().references(() => posOrderLines.id, { onDelete: "cascade" }),
}, table => [uniqueIndex("pos_production_ticket_lines_line_unique").on(table.orderLineId), index("pos_production_ticket_lines_ticket_idx").on(table.ticketId)]);

export const posReceipts = pgTable("pos_receipts", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => posOrders.id, { onDelete: "cascade" }),
  branchId: text("branch_id").notNull().references(() => branches.id),
  receiptNumber: text("receipt_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("pos_receipts_order_unique").on(table.orderId), uniqueIndex("pos_receipts_number_unique").on(table.branchId, table.receiptNumber)]);

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
    // Tanzanian Shilling (TZS) banknotes: 10,000 / 5,000 / 2,000 / 1,000 / 500.
    // Coins (200/100/50 TSh) are not individually counted — coinsInr below is
    // the single catch-all for every coin denomination, same as before.
    note10000Count: integer("note_10000_count").notNull().default(0),
    note5000Count: integer("note_5000_count").notNull().default(0),
    note2000Count: integer("note_2000_count").notNull().default(0),
    note1000Count: integer("note_1000_count").notNull().default(0),
    note500Count: integer("note_500_count").notNull().default(0),
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
