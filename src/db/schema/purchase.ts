import { boolean, index, jsonb, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { rawMaterials } from "./menu";
import { users } from "./auth";
import { vendors } from "./vendors";

export const indentStatusEnum = pgEnum("indent_status", [
  "DRAFT",
  "PENDING_APPROVAL", // >25% spike vs daily average -> owner WhatsApp approval
  "APPROVED",
  "REJECTED",
  "PO_RAISED",
]);

export const indents = pgTable(
  "indents",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    raisedById: text("raised_by_id")
      .notNull()
      .references(() => users.id),
    status: indentStatusEnum("status").notNull().default("DRAFT"),
    dailyAvgQtyJson: jsonb("daily_avg_qty_json"), // per-raw-material rolling average snapshot
    spikePercent: numeric("spike_percent", { precision: 5, scale: 2 }),
    approvedById: text("approved_by_id").references(() => users.id),
    waApprovalMsgId: text("wa_approval_msg_id").notNull().default(""), // interactive WA msg id, audit trail
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("indents_branch_id_idx").on(table.branchId)]
);

export const indentLines = pgTable(
  "indent_lines",
  {
    id: text("id").primaryKey(),
    indentId: text("indent_id")
      .notNull()
      .references(() => indents.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
  },
  (table) => [index("indent_lines_indent_id_idx").on(table.indentId)]
);

export const poStatusEnum = pgEnum("po_status", [
  "CREATED",
  "SENT",
  "DISPATCHED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
]);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(),
    poNumber: text("po_number").notNull().unique(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id),
    indentId: text("indent_id").references(() => indents.id), // null for a general (non-indent) purchase
    // True for a purchase that is NOT raw-material/store-related (e.g. office
    // supplies, a repair part) — raised directly without going through an
    // Indent. Same 3-step Buy -> Bill Upload -> Material Receive flow either
    // way; this flag only changes what the PO lines are allowed to reference
    // (see purchaseOrderLines.itemDescription below) and keeps it out of
    // Inventory/GRN-into-stock reporting.
    isGeneralPurchase: boolean("is_general_purchase").notNull().default(false),
    status: poStatusEnum("status").notNull().default("CREATED"),
    // Step 1: Buy — raising/recording the purchase itself (this row's createdAt).
    boughtAt: timestamp("bought_at", { withTimezone: true }),
    // Step 2: Bill Upload — explicitly OPTIONAL per the brief (purchaser may
    // skip straight to Step 3 if there's genuinely no bill yet).
    pdfUrl: text("pdf_url").notNull().default(""), // legacy free-text URL field, kept for back-compat
    billBlobPathname: text("bill_blob_pathname").notNull().default(""), // real uploaded file (private Vercel Blob store)
    billContentType: text("bill_content_type").notNull().default(""),
    billUploadedAt: timestamp("bill_uploaded_at", { withTimezone: true }),
    // Step 3: Material Receive — set when the linked GRN is created (see grns
    // below); kept here too so the 3-step UI can read one row, not a join.
    materialReceivedAt: timestamp("material_received_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("purchase_orders_branch_id_idx").on(table.branchId)]
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: text("id").primaryKey(),
    poId: text("po_id")
      .notNull()
      .references(() => purchaseOrders.id),
    // Exactly one of these two is set: rawMaterialId for a store/Indent-driven
    // line, itemDescription for a general (non-store) purchase line — enforce
    // "exactly one" in the API layer, a DB CHECK across two nullable columns
    // is possible but adds little here given this project's existing
    // plain-text-FK convention elsewhere.
    rawMaterialId: text("raw_material_id").references(() => rawMaterials.id),
    itemDescription: text("item_description").notNull().default(""),
    qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
    rate: numeric("rate", { precision: 10, scale: 2 }).notNull(), // locked vendor rate at PO time
  },
  (table) => [index("purchase_order_lines_po_id_idx").on(table.poId)]
);

export const grnStatusEnum = pgEnum("grn_status", ["PENDING", "RECEIVED", "QUALITY_HOLD", "APPROVED"]);
// Store-side quality check outcome at material receipt (Step 3). PASS -> the
// received qty is posted into inventoryStock. FAIL -> qtyFailed (in the raw
// material's own UOM) is recorded on the line, the failed qty is returned to
// the vendor (not stocked), and a matching refund/credit is logged to
// Accounts (see accounts.ts materialReturnRefunds).
export const grnQualityResultEnum = pgEnum("grn_quality_result", ["PENDING", "PASS", "FAIL", "PARTIAL"]);

export const grns = pgTable(
  "grns",
  {
    id: text("id").primaryKey(),
    poId: text("po_id")
      .notNull()
      .references(() => purchaseOrders.id),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    receivedById: text("received_by_id")
      .notNull()
      .references(() => users.id),
    status: grnStatusEnum("status").notNull().default("PENDING"),
    qualityResult: grnQualityResultEnum("quality_result").notNull().default("PENDING"),
    qualityPhotoUrl: text("quality_photo_url").notNull().default(""),
    qualityNote: text("quality_note").notNull().default(""), // reason when FAIL/PARTIAL
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("grns_branch_id_idx").on(table.branchId)]
);

export const grnLines = pgTable(
  "grn_lines",
  {
    id: text("id").primaryKey(),
    grnId: text("grn_id")
      .notNull()
      .references(() => grns.id),
    rawMaterialId: text("raw_material_id").references(() => rawMaterials.id),
    itemDescription: text("item_description").notNull().default(""), // general-purchase line, mirrors PO line
    qtyOrdered: numeric("qty_ordered", { precision: 12, scale: 3 }).notNull(),
    qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }).notNull(),
    // Qty that FAILED quality check, in the material's own UOM — goes back to
    // the vendor, never posted to inventoryStock. qtyReceived - qtyFailed is
    // what actually lands in stock on a PASS/PARTIAL result.
    qtyFailed: numeric("qty_failed", { precision: 12, scale: 3 }).notNull().default("0"),
    rateOrdered: numeric("rate_ordered", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [index("grn_lines_grn_id_idx").on(table.grnId)]
);

// One row per failed-quality return — the money side of a GRN quality FAIL.
// qtyFailed * rateOrdered (from the grnLine) is the refund/credit amount the
// vendor owes back; this row is what Accounts reconciles against.
export const materialReturns = pgTable(
  "material_returns",
  {
    id: text("id").primaryKey(),
    grnId: text("grn_id")
      .notNull()
      .references(() => grns.id),
    grnLineId: text("grn_line_id")
      .notNull()
      .references(() => grnLines.id),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    qtyReturned: numeric("qty_returned", { precision: 12, scale: 3 }).notNull(),
    refundAmountInr: numeric("refund_amount_inr", { precision: 12, scale: 2 }).notNull(),
    reasonNote: text("reason_note").notNull().default(""),
    submittedToAccountsAt: timestamp("submitted_to_accounts_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Money-received/credit-note settlement — written ONLY via the
    // ACCOUNTS_EXPENSES-gated "Mark as Settled" action (VENDOR_REFUNDS stays
    // read-only, see moduleAccess.ts). Once-only: settledAt null -> set is
    // the one-shot gate, same convention as purchaseOrders.billUploadedAt.
    settledAmountInr: numeric("settled_amount_inr", { precision: 12, scale: 2 }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    settledById: text("settled_by_id").references(() => users.id),
    settledNote: text("settled_note").notNull().default(""),
  },
  (table) => [index("material_returns_branch_id_idx").on(table.branchId)]
);

export const vendorInvoices = pgTable(
  "vendor_invoices",
  {
    id: text("id").primaryKey(),
    poId: text("po_id")
      .notNull()
      .references(() => purchaseOrders.id),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id),
    invoiceNumber: text("invoice_number").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // vendor's stated invoice amount, before adjustment
    // Store-side correction applied to the vendor's stated amount (e.g. a
    // tax/VAT miscalculation on the vendor's bill) — signed, can be
    // negative. adjustedAmount = amount + taxAdjustmentInr is what the
    // 3-way match compares against the PO/GRN accepted value.
    taxAdjustmentInr: numeric("tax_adjustment_inr", { precision: 12, scale: 2 }).notNull().default("0"),
    taxAdjustmentNote: text("tax_adjustment_note").notNull().default(""),
    photoUrl: text("photo_url").notNull().default(""), // legacy free-text URL field, kept for back-compat
    blobPathname: text("blob_pathname").notNull().default(""), // real uploaded file (private Vercel Blob store)
    contentType: text("content_type").notNull().default(""),
    submittedById: text("submitted_by_id")
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("vendor_invoices_branch_id_idx").on(table.branchId), index("vendor_invoices_po_id_idx").on(table.poId)]
);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "THREE_WAY_LOCKED", // mismatch — payment cannot be released
  "APPROVED",
  "PAID",
]);

export const threeWayMatch = pgTable(
  "three_way_match",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    poId: text("po_id")
      .notNull()
      .unique()
      .references(() => purchaseOrders.id),
    grnId: text("grn_id")
      .notNull()
      .unique()
      .references(() => grns.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => vendorInvoices.id),
    poTotalInr: numeric("po_total_inr", { precision: 12, scale: 2 }).notNull(),
    grnAcceptedTotalInr: numeric("grn_accepted_total_inr", { precision: 12, scale: 2 }).notNull(),
    invoiceAdjustedTotalInr: numeric("invoice_adjusted_total_inr", { precision: 12, scale: 2 }).notNull(),
    matched: boolean("matched").notNull().default(false), // PO rate == GRN accepted value == Invoice (adjusted), within tolerance
    mismatchReason: text("mismatch_reason").notNull().default(""),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("PENDING"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    approvedById: text("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidById: text("paid_by_id").references(() => users.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [index("three_way_match_branch_id_idx").on(table.branchId)]
);
