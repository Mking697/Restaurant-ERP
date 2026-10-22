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
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
    tenderType: text("tender_type").notNull(), // CASH, UPI, CARD, SWIGGY, ZOMATO
    status: orderStatusEnum("status").notNull().default("COMPLETED"),
    voidReason: text("void_reason").notNull().default(""),
    cashierId: text("cashier_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("pos_orders_branch_order_number_unique").on(table.branchId, table.orderNumber),
    index("pos_orders_branch_created_idx").on(table.branchId, table.createdAt),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cash_drops_branch_cashier_shift_unique").on(
      table.branchId,
      table.cashierId,
      table.shiftDate
    ),
    index("cash_drops_branch_id_idx").on(table.branchId),
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
