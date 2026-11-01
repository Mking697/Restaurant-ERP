import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { grnLines, grns, purchaseOrderLines, purchaseOrders, threeWayMatch, threeWayMatchGrns, vendorInvoices } from "../../db/schema/purchase";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { computeThreeWayMatch, parseInvoiceInput } from "./purchase";

// PURCHASE-3: one vendor invoice per PO — still true, UNCHANGED by GAP-005's
// multi-delivery follow-up. A PO's deliveries can now be split across
// several GRNs (see [id]/receive/route.ts); invoicing requires the PO to be
// FULLY received (status RECEIVED) and EVERY one of its GRNs to have an
// already-recorded quality decision (status !== "PENDING") — invoicing
// against a partially-delivered or not-yet-quality-checked PO would compare
// against an incomplete accepted value.
async function loadPoAndGrnsForInvoice(tx: Executor, actor: Identity, poId: string) {
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) throw new HttpError(404, "Purchase order not found");
  branchScope(actor, po.branchId);
  const poGrns = await tx.select().from(grns).where(eq(grns.poId, poId));
  if (!poGrns.length) throw new HttpError(409, "Material must be received (GRN created) before recording an invoice");
  if (po.status !== "RECEIVED") throw new HttpError(409, "Purchase order must be fully received (every delivery done) before recording an invoice");
  if (poGrns.some((g) => g.status === "PENDING")) throw new HttpError(409, "Every delivery's quality check must be recorded before recording an invoice");
  const [existing] = await tx.select({ id: vendorInvoices.id }).from(vendorInvoices).where(eq(vendorInvoices.poId, poId)).limit(1);
  if (existing) throw new HttpError(409, "An invoice is already recorded for this purchase order");
  return { po, poGrns };
}

export interface CreateInvoiceDocument { blobPathname: string; contentType: string; photoUrl: string }
export async function createVendorInvoice(
  tx: Executor,
  actor: Identity,
  poId: string,
  input: Record<string, unknown>,
  document: CreateInvoiceDocument
) {
  assertModule(actor, "PURCHASE_ORDER");
  const { po, poGrns } = await loadPoAndGrnsForInvoice(tx, actor, poId);
  const parsed = parseInvoiceInput(input);

  const poLines = await tx.select({ qty: purchaseOrderLines.qty, rate: purchaseOrderLines.rate }).from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId));
  // Aggregate EVERY contributing GRN's lines — not just one — before
  // comparing against the PO's ordered qty/rate. computeThreeWayMatch
  // itself is agnostic to how many GRNs the lines came from; it just
  // reduces over the array given.
  const lines = await tx.select({ qtyReceived: grnLines.qtyReceived, qtyFailed: grnLines.qtyFailed, rateOrdered: grnLines.rateOrdered }).from(grnLines).where(inArray(grnLines.grnId, poGrns.map((g) => g.id)));
  const match = computeThreeWayMatch({ poLines, grnLines: lines, invoiceAmount: parsed.amount, taxAdjustmentInr: parsed.taxAdjustmentInr });

  const invoiceId = randomUUID();
  await tx.insert(vendorInvoices).values({
    id: invoiceId,
    poId,
    branchId: po.branchId,
    vendorId: po.vendorId,
    invoiceNumber: parsed.invoiceNumber,
    amount: parsed.amount,
    taxAdjustmentInr: parsed.taxAdjustmentInr,
    taxAdjustmentNote: parsed.taxAdjustmentNote,
    photoUrl: document.photoUrl,
    blobPathname: document.blobPathname,
    contentType: document.contentType,
    submittedById: actor.id,
  });
  const matchId = randomUUID();
  await tx.insert(threeWayMatch).values({
    id: matchId,
    branchId: po.branchId,
    poId,
    grnId: poGrns[poGrns.length - 1]!.id, // informational "last GRN" pointer only — see threeWayMatchGrns for the full list
    invoiceId,
    poTotalInr: match.poTotalInr,
    grnAcceptedTotalInr: match.grnAcceptedTotalInr,
    invoiceAdjustedTotalInr: match.invoiceAdjustedTotalInr,
    matched: match.matched,
    mismatchReason: match.mismatchReason,
    paymentStatus: match.matched ? "PENDING" : "THREE_WAY_LOCKED",
    lockedAt: match.matched ? null : new Date(),
  });
  // One row per contributing GRN — the full audit trail of which deliveries
  // this match's aggregated accepted value is built from.
  await tx.insert(threeWayMatchGrns).values(poGrns.map((g) => ({ id: randomUUID(), matchId, grnId: g.id })));
  const [invoice] = await tx.select().from(vendorInvoices).where(eq(vendorInvoices.id, invoiceId));
  const [matchRow] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.invoiceId, invoiceId));
  return { invoice, match: matchRow };
}

export async function readPoInvoice(tx: Executor, actor: Identity, poId: string) {
  const [po] = await tx.select({ branchId: purchaseOrders.branchId }).from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) throw new HttpError(404, "Purchase order not found");
  branchScope(actor, po.branchId);
  const [invoice] = await tx.select().from(vendorInvoices).where(eq(vendorInvoices.poId, poId)).limit(1);
  if (!invoice) return { invoice: null, match: null };
  const [match] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.invoiceId, invoice.id)).limit(1);
  return { invoice, match: match ?? null };
}

// Owner/Accounts-only (ACCOUNTS_EXPENSES) payment-release actions. Both are
// once-only state transitions, same "the DB row's own status field is the
// gate" convention as the rest of this module — no separate idempotency
// receipt needed since there's nothing to replay (a second call with the
// same inputs just hits the guard and 409s, which is the correct outcome:
// an accidental double-click must never double-approve/double-pay).
export async function approveThreeWayPayment(tx: Executor, actor: Identity, poId: string) {
  assertModule(actor, "ACCOUNTS_EXPENSES");
  const [po] = await tx.select({ branchId: purchaseOrders.branchId }).from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) throw new HttpError(404, "Purchase order not found");
  branchScope(actor, po.branchId);
  const [row] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.poId, poId)).limit(1);
  if (!row) throw new HttpError(404, "No invoice/3-way match recorded for this purchase order");
  if (!row.matched) throw new HttpError(409, "PO, GRN and invoice do not match; cannot approve payment");
  if (row.paymentStatus !== "PENDING") throw new HttpError(409, `Payment is already ${row.paymentStatus}`);
  await tx.update(threeWayMatch).set({ paymentStatus: "APPROVED", approvedById: actor.id, approvedAt: new Date() }).where(and(eq(threeWayMatch.id, row.id), eq(threeWayMatch.branchId, po.branchId)));
  const [updated] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.id, row.id));
  return { match: updated };
}
export async function markThreeWayPaid(tx: Executor, actor: Identity, poId: string) {
  assertModule(actor, "ACCOUNTS_EXPENSES");
  const [po] = await tx.select({ branchId: purchaseOrders.branchId }).from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) throw new HttpError(404, "Purchase order not found");
  branchScope(actor, po.branchId);
  const [row] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.poId, poId)).limit(1);
  if (!row) throw new HttpError(404, "No invoice/3-way match recorded for this purchase order");
  if (row.paymentStatus !== "APPROVED") throw new HttpError(409, "Payment must be APPROVED before it can be marked PAID");
  await tx.update(threeWayMatch).set({ paymentStatus: "PAID", paidById: actor.id, paidAt: new Date() }).where(and(eq(threeWayMatch.id, row.id), eq(threeWayMatch.branchId, po.branchId)));
  const [updated] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.id, row.id));
  return { match: updated };
}
