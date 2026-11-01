import { boolean, index, jsonb, numeric, pgEnum, pgSequence, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
    // GAP-018: cancels the REMAINING undispatched quantity only — never
    // touches stock already dispatched (see materialReturnDispatches
    // below). Owner-only, once-only, same convention as settledAt.
    remainingCancelledAt: timestamp("remaining_cancelled_at", { withTimezone: true }),
    remainingCancelledById: text("remaining_cancelled_by_id").references(() => users.id),
    remainingCancelledNote: text("remaining_cancelled_note").notNull().default(""),
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
    // GAP-005 multi-delivery follow-up: no longer the SOLE GRN behind this
    // match — see three_way_match_grns below for the full contributing
    // list. Kept here, now nullable and non-unique, purely as an
    // informational "last/triggering GRN" pointer for old call sites that
    // may still read it; new code should read three_way_match_grns.
    grnId: text("grn_id").references(() => grns.id),
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

// GAP-005 multi-delivery follow-up: one row per GRN that contributed to a
// match's aggregated accepted value — a PO can now be delivered (and
// quality-checked) across multiple GRNs before its ONE final invoice/match
// is raised (see vendor-invoices.ts's loadPoAndGrnForInvoice, now requiring
// the PO's status to be RECEIVED — fully delivered — before invoicing).
// "One invoice per PO" itself is UNCHANGED, still enforced in vendor-invoices.ts.
export const threeWayMatchGrns = pgTable(
  "three_way_match_grns",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => threeWayMatch.id),
    grnId: text("grn_id")
      .notNull()
      .references(() => grns.id),
  },
  (table) => [
    index("three_way_match_grns_match_id_idx").on(table.matchId),
    uniqueIndex("three_way_match_grns_match_grn_unique").on(table.matchId, table.grnId),
  ]
);

// ---------------------------------------------------------------------------
// GAP-016 (November 2026). General-purchase mandatory HO approval gate.
//
// General purchases skip the indent entirely (no raw material, no vendor
// rate lock), so there was no place for the Owner's value-threshold
// mandatory-approval policy (src/lib/server/business-policy.ts) to apply —
// a user could flag isGeneralPurchase=true and bypass it completely. This
// table is that missing gate, deliberately NOT reusing the indents table
// (a general purchase has no raw material / no rolling-average spike
// concept to evaluate).
//
// Flow: POST /api/purchase/general-purchase-requests (any PURCHASE_ORDER
// actor) computes the stated value (qty x rate, both supplied by the
// requester, no vendor-rate lookup needed) against the SAME Owner-configured
// threshold indents use. Below threshold (or no threshold configured) =
// auto-APPROVED immediately, zero added friction, matching the indent
// free-path. At/above threshold = PENDING_APPROVAL, Owner-only review
// (POST .../[id]/approve — assertOwner, same single-actor authority as
// every other mandatory-HO decision this session). POST
// /api/purchase/orders (general-purchase path) then REQUIRES a matching
// APPROVED, not-yet-consumed request whenever the SAME threshold check on
// the PO's own lines would apply — marks it CONSUMED on success so one
// approval can never authorize two different purchases (one-time use,
// same discipline as GAP-014's requisitionLineId linkage).
// ---------------------------------------------------------------------------
export const generalPurchaseRequestStatusEnum = pgEnum("general_purchase_request_status", ["PENDING_APPROVAL", "APPROVED", "REJECTED", "CONSUMED"]);

export const generalPurchaseRequests = pgTable(
  "general_purchase_requests",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    requestedById: text("requested_by_id").notNull().references(() => users.id),
    vendorId: text("vendor_id").notNull().references(() => vendors.id),
    linesJson: jsonb("lines_json").notNull(), // [{ itemDescription, qty, rate }] — the exact lines this approval covers
    valueTsh: numeric("value_tsh", { precision: 14, scale: 2 }).notNull(),
    status: generalPurchaseRequestStatusEnum("status").notNull().default("PENDING_APPROVAL"),
    approvedById: text("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("general_purchase_requests_branch_id_idx").on(table.branchId)]
);

// ---------------------------------------------------------------------------
// GAP-017 (November 2026). Auditable vendor payment records.
//
// Owner decision (confirmed via clarify, November 1, 2026): full-payment
// only this pass (GAP-001 left partial payments explicitly unresolved/
// un-approved) — one invoice/match is paid in exactly ONE real evidence
// record covering its full invoiceAdjustedTotalInr, never a partial
// allocation. The schema itself still allows multiple rows per matchId
// (no unique constraint) so a future, separately-approved partial-payment
// pass never needs a breaking schema rewrite — the "exactly one, for the
// full amount" rule is enforced in the SERVER (vendor-payments.ts), not
// baked into the table shape.
//
// This REPLACES the old markThreeWayPaid's bare status flip (PAID with no
// amount/date/method/reference evidence) — the threeWayMatch.paymentStatus/
// paidById/paidAt columns are kept for backward-compatible reads, but the
// real evidence now lives here. Preserves the existing APPROVED-only gate
// (payment still cannot bypass the quality/3-way-mismatch lock) and the
// once-only state-transition discipline already used throughout this file.
// ---------------------------------------------------------------------------
export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY"]);

export const vendorPayments = pgTable(
  "vendor_payments",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull().references(() => threeWayMatch.id),
    poId: text("po_id").notNull().references(() => purchaseOrders.id),
    branchId: text("branch_id").notNull().references(() => branches.id),
    vendorId: text("vendor_id").notNull().references(() => vendors.id),
    amountTsh: numeric("amount_tsh", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    referenceNumber: text("reference_number").notNull().default(""),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(), // actual bank/cash execution date, supplied by the recording actor — distinct from createdAt (when recorded in this system); this record is evidence of a payment, never proof the bank transfer itself happened
    recordedById: text("recorded_by_id").notNull().references(() => users.id),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("vendor_payments_match_id_idx").on(table.matchId), index("vendor_payments_branch_id_idx").on(table.branchId)]
);

// ---------------------------------------------------------------------------
// GAP-018 (November 2026). Physical purchase-return lifecycle — the
// missing PHYSICAL dispatch/vendor-acknowledgment layer on top of the
// EXISTING materialReturns claim (which is, and remains, money-side only:
// an expected refund/credit claim auto-created on a GRN quality
// FAIL/PARTIAL). Owner decision: scoped to this EXISTING claim type only —
// a return of ALREADY-ACCEPTED/good stock is explicitly out of scope this
// pass (would need its own new claim type/design).
//
// "Avoid double-deduction" is already satisfied by construction: a failed
// GRN line's qty NEVER gets posted to inventoryStock in the first place
// (see grnLines.qtyFailed's own comment) — there is no usable-stock
// quantity to deduct a second time for THIS claim type. Physical dispatch
// here is purely evidentiary (quarantine -> actually sent back to the
// vendor), never a stock-ledger write.
//
// One or more dispatch rows per claim (partial dispatch across several
// trips is allowed) — sum(qtyDispatched) can never exceed
// materialReturns.qtyReturned. Owner-only cancellation of the REMAINING
// undispatched quantity (materialReturns.remainingCancelledAt above) never
// touches an already-created dispatch row.
// ---------------------------------------------------------------------------
export const materialReturnDispatches = pgTable(
  "material_return_dispatches",
  {
    id: text("id").primaryKey(),
    materialReturnId: text("material_return_id").notNull().references(() => materialReturns.id),
    branchId: text("branch_id").notNull().references(() => branches.id),
    qtyDispatched: numeric("qty_dispatched", { precision: 12, scale: 3 }).notNull(),
    reasonNote: text("reason_note").notNull(),
    evidencePhotoUrl: text("evidence_photo_url").notNull().default(""), // optional, free-text URL (same legacy convention as vendorInvoices.photoUrl/grns.qualityPhotoUrl)
    dispatchedById: text("dispatched_by_id").notNull().references(() => users.id),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull().defaultNow(),
    // Vendor acknowledgment of receipt — recorded by staff attesting a
    // real signed slip/confirmation exists, not a vendor-side system
    // action (the vendor is never a user of this system). Once-only.
    vendorAcknowledgedAt: timestamp("vendor_acknowledged_at", { withTimezone: true }),
    vendorAcknowledgedById: text("vendor_acknowledged_by_id").references(() => users.id),
  },
  (table) => [index("material_return_dispatches_claim_id_idx").on(table.materialReturnId), index("material_return_dispatches_branch_id_idx").on(table.branchId)]
);

// ---------------------------------------------------------------------------
// GAP-019 (November 2026). Numbered debit notes — the formal document a
// vendor is issued claiming credit for a material-return claim. Owner
// decisions:
//  1) Tax treatment is explicitly DEFERRED (no VAT/TRA field at all) —
//     consistent with this project's standing GST->VAT deferral; never
//     guess Tanzania VAT/TRA numbering rules.
//  2) Simple 1:1 scope — one debit note per materialReturns claim, for
//     EXACTLY that claim's refundAmountInr (never a partial or a
//     multi-claim document).
//  3) Create AND cancel are both Owner/ACCOUNTS_EXPENSES-only (same grant
//     as settleVendorReturn).
//
// Debit-note issuance is a SEPARATE legal-document action from
// settleVendorReturn (money/credit actually received) — issuing one does
// NOT itself record settlement, and settling does NOT require one; this
// pass only prevents a SECOND non-cancelled debit note against the SAME
// claim (no double-issuance of the same credit document). A cancelled
// debit note permanently keeps its number (never reused) but frees the
// claim to receive a fresh one.
export const debitNoteSeq = pgSequence("debit_note_seq", { startWith: 1, increment: 1 });

export const debitNotes = pgTable(
  "debit_notes",
  {
    id: text("id").primaryKey(),
    debitNoteNumber: text("debit_note_number").notNull().unique(), // e.g. "DN-000123" — reserved via debitNoteSeq's nextval, inside the same transaction as the insert; permanent even after cancellation
    materialReturnId: text("material_return_id").notNull().references(() => materialReturns.id),
    branchId: text("branch_id").notNull().references(() => branches.id),
    vendorId: text("vendor_id").notNull().references(() => vendors.id),
    amountTsh: numeric("amount_tsh", { precision: 12, scale: 2 }).notNull(), // must exactly equal the claim's refundAmountInr at issuance time
    reasonNote: text("reason_note").notNull(),
    issuedById: text("issued_by_id").notNull().references(() => users.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledById: text("cancelled_by_id").references(() => users.id),
    cancelledNote: text("cancelled_note").notNull().default(""),
  },
  (table) => [index("debit_notes_claim_id_idx").on(table.materialReturnId), index("debit_notes_branch_id_idx").on(table.branchId)]
);
