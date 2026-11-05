import { index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";
import { posOrders, posReceipts } from "./pos";
import { posDocuments } from "./pos-documents";
import { posPayments } from "./pos-payments";

/**
 * GAP-027: one append-only reversal record per voided PAID/COMPLETED order
 * (unique on orderId — exactly one void per order, retry-safe). Never
 * mutates the original order's payment/receipt/FINAL/COGS rows; those stay
 * byte-for-byte historical evidence. restockedLines/wastedLines are a plain
 * JSON breakdown (menuItemId/name/qty) captured at void time for the audit
 * trail only — per approved GAP-027 scope, waste is recorded here and does
 * NOT also post a new wastage-ledger entry in this pass.
 */
export const posOrderReversals = pgTable(
  "pos_order_reversals",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => posOrders.id, { onDelete: "cascade" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    reason: text("reason").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    actorName: text("actor_name").notNull(),
    priorStatus: text("prior_status").notNull(), // "PAID" | "COMPLETED" at the moment of void
    paymentId: text("payment_id").references(() => posPayments.id),
    receiptId: text("receipt_id").references(() => posReceipts.id),
    finalDocumentId: text("final_document_id").references(() => posDocuments.id),
    // Audit snapshot of the order's own captured COGS at void time — never
    // edits pos_orders.cogsAmount itself. Existing report readers already
    // filter orders to status IN (PAID, COMPLETED), so a VOIDED order is
    // already excluded from forward COGS/P&L aggregates without this row
    // changing anything on the order itself.
    cogsAmountAtVoid: numeric("cogs_amount_at_void", { precision: 12, scale: 2 }).notNull(),
    // Null only when the order was voided before any GAP-026 payment was
    // ever captured (e.g. a COMPLETED legacy row with no payment evidence).
    refundLiabilityAmount: numeric("refund_liability_amount", { precision: 10, scale: 2 }),
    restockedLines: jsonb("restocked_lines").notNull().default([]),
    wastedLines: jsonb("wasted_lines").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pos_order_reversals_order_unique").on(table.orderId),
    index("pos_order_reversals_branch_id_idx").on(table.branchId),
  ]
);
