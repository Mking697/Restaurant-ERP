import { sql } from "drizzle-orm";
import { check, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { menuItems } from "./menu";
import { users } from "./auth";
import { internalRequisitionLines } from "./requisitions";

// ---------------------------------------------------------------------------
// GAP-013 (November 2026). Prepared Semi-FG transfer — BRANCH-TO-BRANCH (a
// "Base Kitchen" branch produces via Actual Cutting/Fixed-Recipe, dispatches
// its real prepared-stock balance to another branch), a SEPARATE mechanism
// from the existing RAW-material CENTRAL-warehouse transfer
// (src/app/api/stock-transfers/route.ts, which has no Semi-FG/warehouse
// concept at all) — Owner decision, confirmed via clarify.
//
// Owner decisions (confirmed via clarify, November 1, 2026):
//   1. Branch-to-branch, not warehouse-based — Semi-FG stock has no
//      warehouse concept; it lives directly on a branch.
//   2. Cross-branch product identity is matched by EXACT NAME (menuItems
//      has no shared cross-branch catalog id today, and none is added this
//      pass) — the dispatching branch's own Semi-FG item name must match
//      EXACTLY ONE Semi-FG item at the destination branch, with the SAME
//      outputUnit; zero or multiple matches fails closed (409), never a
//      guessed destination.
//   3. Full accept/partial-receipt/duplicate-receipt-safe flow, mirroring
//      GAP-006's raw stock-transfers robustness (idempotent receipt,
//      partial qtyReceived < qtyDispatched reported as variance, no
//      double-credit on a retried callback).
//   4. Real per-unit production cost (GAP-010) is NOT carried across this
//      transfer this pass — GAP-010 itself already explicitly deferred
//      "carrying cost forward into downstream consumption/transfer" as its
//      own future-scope item, and no running per-balance average cost
//      exists on semiFgStock to snapshot honestly (GAP-010 costs a single
//      PRODUCTION EVENT, not a pooled, possibly-multi-sourced balance).
//      Only quantity moves this pass; cost-carry stays a named follow-up.
//
// destMenuItemId is resolved ONCE at dispatch time and frozen on the
// transfer row — a later catalog rename at either branch never retroactively
// changes an already-dispatched transfer's resolved destination.
// ---------------------------------------------------------------------------

export const semiFgTransfers = pgTable(
  "semi_fg_transfers",
  {
    id: text("id").primaryKey(),
    fromBranchId: text("from_branch_id").notNull().references(() => branches.id),
    toBranchId: text("to_branch_id").notNull().references(() => branches.id),
    sourceMenuItemId: text("source_menu_item_id").notNull().references(() => menuItems.id),
    destMenuItemId: text("dest_menu_item_id").notNull().references(() => menuItems.id),
    outputUnitAtDispatch: text("output_unit_at_dispatch").notNull(),
    qtyDispatched: numeric("qty_dispatched", { precision: 12, scale: 3 }).notNull(),
    qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }),
    status: text("status").$type<"DISPATCHED" | "RECEIVED">().notNull().default("DISPATCHED"),
    dispatchedById: text("dispatched_by_id").notNull().references(() => users.id),
    receivedById: text("received_by_id").references(() => users.id),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    // GAP-014: optional link to the internal-requisition line this real
    // dispatch fulfills — NULL for an ad-hoc transfer with no requisition.
    requisitionLineId: text("requisition_line_id").references(() => internalRequisitionLines.id),
  },
  (table) => [
    index("semi_fg_transfers_from_idx").on(table.fromBranchId),
    index("semi_fg_transfers_to_idx").on(table.toBranchId),
    check("semi_fg_transfers_branches_differ", sql`${table.fromBranchId} <> ${table.toBranchId}`),
    check("semi_fg_transfers_qty_positive", sql`${table.qtyDispatched} > 0`),
    check("semi_fg_transfers_received_bounded", sql`${table.qtyReceived} is null or (${table.qtyReceived} >= 0 and ${table.qtyReceived} <= ${table.qtyDispatched})`),
  ]
);

// One receipt per transfer — idempotency anchor, same pattern as
// batchTransferReceipts (src/db/schema/batch-audit.ts).
export const semiFgTransferReceipts = pgTable(
  "semi_fg_transfer_receipts",
  {
    id: text("id").primaryKey(),
    transferId: text("transfer_id").notNull().references(() => semiFgTransfers.id),
    actorId: text("actor_id").notNull().references(() => users.id),
    request: jsonb("request").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("semi_fg_transfer_receipts_transfer_unique").on(table.transferId)]
);
