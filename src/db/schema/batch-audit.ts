import { sql } from "drizzle-orm";
import { check, date, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { stockBatches } from "./inventory";
import { stockTransfers } from "./warehouses";
import { users } from "./auth";

// Append-only evidence: no synthetic reconstruction of historical movements.
export const batchMovements = pgTable("batch_movements", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => stockBatches.id),
  qtyDelta: numeric("qty_delta", { precision: 12, scale: 3 }).notNull(),
  sourceType: text("source_type").notNull(), sourceId: text("source_id").notNull(),
  actorId: text("actor_id").notNull().references(() => users.id),
  evidence: text("evidence").notNull().default(""),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("batch_movements_batch_idx").on(t.batchId), index("batch_movements_source_idx").on(t.sourceType, t.sourceId)]);

// Immutable dispatch snapshot; receipt is a separate append-only event.
export const batchTransferAllocations = pgTable("batch_transfer_allocations", {
  id: text("id").primaryKey(),
  transferId: text("transfer_id").notNull().references(() => stockTransfers.id),
  batchId: text("batch_id").notNull().references(() => stockBatches.id),
  originBatchId: text("origin_batch_id").notNull(),
  batchNo: text("batch_no").notNull(), expiryDate: date("expiry_date"),
  expiryStatus: text("expiry_status").$type<"UNKNOWN" | "DATED" | "NON_EXPIRING">().notNull(),
  qtyDispatched: numeric("qty_dispatched", { precision: 12, scale: 3 }).notNull(),
  // GAP-010: frozen at dispatch time from the origin batch's own
  // unitCostTsh (never re-derived later) — receive-time credit reuses
  // this exact value so the same lot's real cost survives the transfer.
  unitCostTsh: numeric("unit_cost_tsh", { precision: 12, scale: 4 }),
  actorId: text("actor_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("batch_transfer_allocations_transfer_idx").on(t.transferId), check("batch_transfer_allocation_positive", sql`${t.qtyDispatched} > 0`)]);

export const batchTransferReceipts = pgTable("batch_transfer_receipts", {
  id: text("id").primaryKey(),
  transferId: text("transfer_id").notNull().references(() => stockTransfers.id),
  actorId: text("actor_id").notNull().references(() => users.id),
  request: jsonb("request").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("batch_transfer_receipts_transfer_unique").on(t.transferId)]);

export const batchTransferReceiptLines = pgTable("batch_transfer_receipt_lines", {
  id: text("id").primaryKey(),
  receiptId: text("receipt_id").notNull().references(() => batchTransferReceipts.id),
  allocationId: text("allocation_id").notNull().references(() => batchTransferAllocations.id),
  qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }).notNull(),
}, t => [uniqueIndex("batch_transfer_receipt_lines_allocation_unique").on(t.allocationId)]);
