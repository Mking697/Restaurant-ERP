import { index, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";
import { posOrders, posReceipts } from "./pos";
import { posDocuments } from "./pos-documents";

// Append-only: no update/delete service. Cascades only follow existing POS teardown.
export const posPayments = pgTable("pos_payments", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  orderId: text("order_id").notNull().references(() => posOrders.id, { onDelete: "cascade" }),
  receiptId: text("receipt_id").notNull().references(() => posReceipts.id, { onDelete: "cascade" }),
  receiptNumber: text("receipt_number").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  tenderType: text("tender_type").notNull(),
  tenderCurrencyCode: text("tender_currency_code").notNull(),
  tenderCurrencyAmount: numeric("tender_currency_amount", { precision: 12, scale: 2 }).notNull(),
  fxRateToInr: numeric("fx_rate_to_inr", { precision: 12, scale: 6 }).notNull(),
  collectorId: text("collector_id").notNull().references(() => users.id),
  collectorName: text("collector_name").notNull(),
  shiftRunId: text("shift_run_id").notNull(),
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
  sourceAction: text("source_action").$type<"CREATE" | "SETTLE">().notNull(),
  finalDocumentId: text("final_document_id").references(() => posDocuments.id),
  finalDocumentNumber: text("final_document_number"),
}, t => [uniqueIndex("pos_payments_order_unique").on(t.orderId), uniqueIndex("pos_payments_receipt_unique").on(t.receiptId), index("pos_payments_branch_shift_idx").on(t.branchId, t.shiftRunId)]);
export const posPaymentAllocations = pgTable("pos_payment_allocations", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id").notNull().references(() => posPayments.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().references(() => posOrders.id, { onDelete: "cascade" }),
  receiptId: text("receipt_id").notNull().references(() => posReceipts.id, { onDelete: "cascade" }),
  finalDocumentId: text("final_document_id").references(() => posDocuments.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
}, t => [uniqueIndex("pos_payment_allocations_payment_unique").on(t.paymentId), uniqueIndex("pos_payment_allocations_order_unique").on(t.orderId), uniqueIndex("pos_payment_allocations_receipt_unique").on(t.receiptId)]);
