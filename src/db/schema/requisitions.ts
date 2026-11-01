import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { rawMaterials, menuItems } from "./menu";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// GAP-014 (November 2026). Internal requisition — a branch requests
// identifiable RAW and/or PREPARED (Semi-FG) products from Base Kitchen /
// central supply, Owner-only approval, fulfillment via the EXISTING raw
// stock-transfer (src/db/schema/warehouses.ts, GAP-006) and Semi-FG
// transfer (src/db/schema/semi-fg-transfers.ts, GAP-013) mechanisms — Owner
// decision, confirmed via clarify: this schema does NOT duplicate dispatch/
// receive logic; it only tracks requested/approved/outstanding quantities
// and LINKS to the real transfer rows that actually moved stock.
//
// Owner decisions (confirmed via clarify, November 1, 2026):
//   1. Mixed RAW + PREPARED lines in one requisition.
//   2. Owner-only approval (single-actor, same pattern as every other
//      approval gate added this session).
//   3. Fulfillment reuses the EXISTING transfer endpoints — a
//      `requisitionLineId` column was added to BOTH `stockTransfers` and
//      `semiFgTransfers` (nullable — an ad-hoc transfer with no requisition
//      stays unlinked, fully backward compatible) so a real dispatch can
//      OPTIONALLY declare which requisition line it fulfills.
//
// qtyIssued/qtyReceived are intentionally NOT stored on the line — they
// are DERIVED by summing the linked transfer rows at read time (never a
// second source of truth that could drift from the real transfers).
// Cancelling a line only writes off the REMAINING (qtyApproved minus
// already-issued) outstanding amount — already-dispatched real stock is
// never touched or reversed by a cancellation, matching the acceptance's
// "cancellation is a remaining-request decision, not deletion of
// dispatched stock".
// ---------------------------------------------------------------------------

export const internalRequisitions = pgTable(
  "internal_requisitions",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    status: text("status").$type<"SUBMITTED" | "APPROVED" | "CLOSED">().notNull().default("SUBMITTED"),
    requestedById: text("requested_by_id").notNull().references(() => users.id),
    approvedById: text("approved_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [index("internal_requisitions_branch_idx").on(table.branchId)]
);

export const internalRequisitionLines = pgTable(
  "internal_requisition_lines",
  {
    id: text("id").primaryKey(),
    requisitionId: text("requisition_id").notNull().references(() => internalRequisitions.id),
    lineType: text("line_type").$type<"RAW" | "PREPARED">().notNull(),
    rawMaterialId: text("raw_material_id").references(() => rawMaterials.id),
    menuItemId: text("menu_item_id").references(() => menuItems.id),
    qtyRequested: numeric("qty_requested", { precision: 12, scale: 3 }).notNull(),
    // NULL until the Owner approves this specific line. Approved 0 is a
    // genuine, explicit "rejected this line" outcome — distinct from an
    // unconfigured/unknown state (which NULL still represents).
    qtyApproved: numeric("qty_approved", { precision: 12, scale: 3 }),
    status: text("status").$type<"PENDING" | "APPROVED" | "REJECTED" | "CANCELLED">().notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("internal_requisition_lines_requisition_idx").on(table.requisitionId),
    check("internal_requisition_lines_type_xor", sql`(${table.lineType} = 'RAW' and ${table.rawMaterialId} is not null and ${table.menuItemId} is null) or (${table.lineType} = 'PREPARED' and ${table.menuItemId} is not null and ${table.rawMaterialId} is null)`),
    check("internal_requisition_lines_qty_positive", sql`${table.qtyRequested} > 0`),
    check("internal_requisition_lines_approved_bounded", sql`${table.qtyApproved} is null or (${table.qtyApproved} >= 0 and ${table.qtyApproved} <= ${table.qtyRequested})`),
  ]
);
