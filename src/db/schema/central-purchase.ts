import { boolean, index, jsonb, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { warehouses } from "./warehouses";
import { rawMaterials } from "./menu";
import { users } from "./auth";
import { vendors } from "./vendors";

// ---------------------------------------------------------------------------
// Central Warehouse Purchase Pipeline (November 2026, Owner-requested).
//
// Mirrors the branch Purchase pipeline (indents/purchaseOrders/grns/
// vendorInvoices/threeWayMatch in ./purchase.ts) one-for-one in SPIRIT, but
// as its OWN parallel set of tables — never touches the branch tables or
// their battle-tested server logic. Reasons: (1) branchId is NOT NULL across
// every branch-purchase table; making it nullable to also mean "central"
// would ripple through dozens of already-live call sites for zero benefit,
// (2) complete isolation means this new, less-tested pipeline can never
// corrupt a real branch's purchase/payment history.
//
// Deliberate v1 simplifications vs the branch pipeline (documented so a
// future pass can extend, not rediscover):
//  - One PO -> at most one GRN -> at most one invoice/match (no GAP-005
//    multi-delivery split, no GAP-018 physical-return dispatch tracking).
//  - A GRN quality FAIL/PARTIAL records qtyFailed but does NOT auto-create a
//    materialReturns-style refund claim — Accounts handles that manually for
//    now (branch's recordVendorReturns automation is not replicated here).
//  - Payment is a single PAID state flip (paidById/paidAt), not GAP-017's
//    full vendor-payments.ts evidence+idempotency record.
//  - No GAP-016-style separate "general purchase" (non-raw-material) lines —
//    every Central Purchase line is a real rawMaterialId.
//
// Approval gate: a Central Purchase Request (value computed from its lines)
// is submitted first; if its value >= the Owner's existing
// INDENT_HO_APPROVAL_VALUE_THRESHOLD_TSH policy (src/lib/server/business-
// policy.ts — the SAME number already governing branch indents/general
// purchases, not a new separate setting), it sits PENDING_APPROVAL for the
// Owner; otherwise it auto-approves immediately (same zero-friction-below-
// threshold convention used everywhere else in this codebase). Creating the
// real PO then consumes exactly one APPROVED, not-yet-consumed request.
// ---------------------------------------------------------------------------

export const centralPurchaseRequestStatusEnum = pgEnum("central_purchase_request_status", ["PENDING_APPROVAL", "APPROVED", "REJECTED", "CONSUMED"]);

export const centralPurchaseRequests = pgTable(
  "central_purchase_requests",
  {
    id: text("id").primaryKey(),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
    requestedById: text("requested_by_id").notNull().references(() => users.id),
    vendorId: text("vendor_id").notNull().references(() => vendors.id),
    linesJson: jsonb("lines_json").notNull(), // [{ rawMaterialId, qty, rate }] — the exact lines this approval covers
    valueTsh: numeric("value_tsh", { precision: 14, scale: 2 }).notNull(),
    status: centralPurchaseRequestStatusEnum("status").notNull().default("PENDING_APPROVAL"),
    approvedById: text("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("central_purchase_requests_warehouse_id_idx").on(table.warehouseId)]
);

export const centralPoStatusEnum = pgEnum("central_po_status", ["CREATED", "RECEIVED", "CLOSED"]);

export const centralPurchaseOrders = pgTable(
  "central_purchase_orders",
  {
    id: text("id").primaryKey(),
    poNumber: text("po_number").notNull().unique(),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
    vendorId: text("vendor_id").notNull().references(() => vendors.id),
    requestId: text("request_id").notNull().references(() => centralPurchaseRequests.id),
    createdById: text("created_by_id").notNull().references(() => users.id),
    status: centralPoStatusEnum("status").notNull().default("CREATED"),
    boughtAt: timestamp("bought_at", { withTimezone: true }).notNull().defaultNow(),
    billBlobPathname: text("bill_blob_pathname").notNull().default(""),
    billContentType: text("bill_content_type").notNull().default(""),
    billUploadedAt: timestamp("bill_uploaded_at", { withTimezone: true }),
    materialReceivedAt: timestamp("material_received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("central_purchase_orders_warehouse_id_idx").on(table.warehouseId)]
);

export const centralPurchaseOrderLines = pgTable(
  "central_purchase_order_lines",
  {
    id: text("id").primaryKey(),
    poId: text("po_id").notNull().references(() => centralPurchaseOrders.id),
    rawMaterialId: text("raw_material_id").notNull().references(() => rawMaterials.id),
    qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
    rate: numeric("rate", { precision: 10, scale: 2 }).notNull(), // locked vendor rate at PO time
  },
  (table) => [index("central_purchase_order_lines_po_id_idx").on(table.poId)]
);

export const centralGrnQualityResultEnum = pgEnum("central_grn_quality_result", ["PENDING", "PASS", "FAIL", "PARTIAL"]);

export const centralGrns = pgTable(
  "central_grns",
  {
    id: text("id").primaryKey(),
    poId: text("po_id").notNull().references(() => centralPurchaseOrders.id),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
    receivedById: text("received_by_id").notNull().references(() => users.id),
    qualityResult: centralGrnQualityResultEnum("quality_result").notNull().default("PENDING"),
    qualityPhotoUrl: text("quality_photo_url").notNull().default(""),
    qualityNote: text("quality_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("central_grns_warehouse_id_idx").on(table.warehouseId)]
);

export const centralGrnLines = pgTable(
  "central_grn_lines",
  {
    id: text("id").primaryKey(),
    grnId: text("grn_id").notNull().references(() => centralGrns.id),
    rawMaterialId: text("raw_material_id").notNull().references(() => rawMaterials.id),
    qtyOrdered: numeric("qty_ordered", { precision: 12, scale: 3 }).notNull(),
    qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }).notNull(),
    qtyFailed: numeric("qty_failed", { precision: 12, scale: 3 }).notNull().default("0"),
    rateOrdered: numeric("rate_ordered", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [index("central_grn_lines_grn_id_idx").on(table.grnId)]
);

export const centralVendorInvoices = pgTable(
  "central_vendor_invoices",
  {
    id: text("id").primaryKey(),
    poId: text("po_id").notNull().unique().references(() => centralPurchaseOrders.id),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
    vendorId: text("vendor_id").notNull().references(() => vendors.id),
    invoiceNumber: text("invoice_number").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    taxAdjustmentInr: numeric("tax_adjustment_inr", { precision: 12, scale: 2 }).notNull().default("0"),
    taxAdjustmentNote: text("tax_adjustment_note").notNull().default(""),
    blobPathname: text("blob_pathname").notNull().default(""),
    contentType: text("content_type").notNull().default(""),
    submittedById: text("submitted_by_id").notNull().references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("central_vendor_invoices_warehouse_id_idx").on(table.warehouseId)]
);

export const centralPaymentStatusEnum = pgEnum("central_payment_status", ["PENDING", "THREE_WAY_LOCKED", "APPROVED", "PAID"]);

export const centralThreeWayMatch = pgTable(
  "central_three_way_match",
  {
    id: text("id").primaryKey(),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
    poId: text("po_id").notNull().unique().references(() => centralPurchaseOrders.id),
    grnId: text("grn_id").notNull().references(() => centralGrns.id),
    invoiceId: text("invoice_id").notNull().references(() => centralVendorInvoices.id),
    poTotalInr: numeric("po_total_inr", { precision: 12, scale: 2 }).notNull(),
    grnAcceptedTotalInr: numeric("grn_accepted_total_inr", { precision: 12, scale: 2 }).notNull(),
    invoiceAdjustedTotalInr: numeric("invoice_adjusted_total_inr", { precision: 12, scale: 2 }).notNull(),
    matched: boolean("matched").notNull().default(false),
    mismatchReason: text("mismatch_reason").notNull().default(""),
    paymentStatus: centralPaymentStatusEnum("payment_status").notNull().default("PENDING"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    approvedById: text("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidById: text("paid_by_id").references(() => users.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [index("central_three_way_match_warehouse_id_idx").on(table.warehouseId)]
);
