import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { centralPurchaseRequests, centralPurchaseOrders, centralPurchaseOrderLines, centralGrns, centralGrnLines, centralVendorInvoices, centralThreeWayMatch } from "../../db/schema/central-purchase";
import type { Executor } from "./auth";
import { assertCentralStoreAccess, assertModule, assertOwner, HttpError, type Identity } from "./permissions";
import { assertCentralWarehouse, creditWarehouseStock } from "./warehouse-stock";
import { creditLocatedBatch } from "./stock-batches";
import { parseBatchInput } from "./batch-policy";
import { allowedFields, computeThreeWayMatch, generatePoNumber, parseInvoiceInput } from "./purchase";
import { numeric, string } from "./http";
import { decimal, quantity } from "./production-quantity";

// See src/db/schema/central-purchase.ts for the full design note — this is
// the server-side business logic for the Central Warehouse purchase
// pipeline (Owner-requested, November 2026), modeled on ./purchase.ts +
// ./general-purchase-approval.ts + ./grn-quality.ts + ./vendor-invoices.ts
// but kept as its own self-contained, simpler module (see the schema file's
// comment for the exact list of deliberate v1 simplifications).

export interface CentralLineInput { rawMaterialId: string; qty: string; rate: string }
export const CENTRAL_PO_LINE_MAX = 50;

export function parseCentralLines(value: unknown): CentralLineInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > CENTRAL_PO_LINE_MAX) {
    throw new HttpError(400, `Central purchase needs 1-${CENTRAL_PO_LINE_MAX} lines`);
  }
  return value.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, `Invalid line ${i + 1}`);
    const line = raw as Record<string, unknown>;
    allowedFields(line, ["rawMaterialId", "qty", "rate"]);
    const rawMaterialId = string(line.rawMaterialId, `line ${i + 1} rawMaterialId`);
    const qty = numeric(line.qty, `line ${i + 1} qty`);
    if (Number(qty) <= 0) throw new HttpError(400, `Line ${i + 1} qty must be greater than zero`);
    const rate = numeric(line.rate, `line ${i + 1} rate`);
    if (Number(rate) <= 0) throw new HttpError(400, `Line ${i + 1} rate must be greater than zero`);
    return { rawMaterialId, qty, rate };
  });
}

// Exact bigint math: qty (scale 3) x rate (scale 2), summed before rounding
// once at the end — same discipline as computeGeneralPurchaseValueTsh.
export function computeCentralPurchaseValueTsh(lines: CentralLineInput[]): string {
  let numerator = 0n;
  for (const line of lines) {
    const qtyMicro = quantity(line.qty, true);
    const [whole, fraction = ""] = line.rate.split(".");
    const rateCenti = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
    numerator += qtyMicro * rateCenti;
  }
  const valueCenti = (numerator + 500n) / 1000n;
  return `${valueCenti / 100n}.${(valueCenti % 100n).toString().padStart(2, "0")}`;
}

export function appliesCentralValueGate(valueTsh: string, thresholdTsh: string | null): boolean {
  if (thresholdTsh === null || thresholdTsh.trim() === "") return false;
  const centi = (v: string) => { const [w, f = ""] = v.split("."); return BigInt(w) * 100n + BigInt(f.padEnd(2, "0").slice(0, 2)); };
  return centi(valueTsh) >= centi(thresholdTsh);
}

function linesEqual(a: CentralLineInput[], b: CentralLineInput[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((lineA, i) => { const lineB = b[i]; return lineA.rawMaterialId === lineB.rawMaterialId && lineA.qty === lineB.qty && lineA.rate === lineB.rate; });
}

// --- Step 0: Central Purchase Request (Owner value-threshold gate) --------

export async function submitCentralPurchaseRequest(tx: Executor, actor: Identity, warehouseId: string, vendorId: string, lines: CentralLineInput[], thresholdTsh: string | null) {
  assertCentralStoreAccess(actor);
  const valueTsh = computeCentralPurchaseValueTsh(lines);
  const gated = appliesCentralValueGate(valueTsh, thresholdTsh);
  const id = randomUUID();
  await tx.insert(centralPurchaseRequests).values({
    id, warehouseId, requestedById: actor.id, vendorId, linesJson: lines, valueTsh,
    status: gated ? "PENDING_APPROVAL" : "APPROVED",
    approvedById: gated ? null : actor.id,
    approvedAt: gated ? null : new Date(),
  });
  const [row] = await tx.select().from(centralPurchaseRequests).where(eq(centralPurchaseRequests.id, id));
  return { request: row, gated };
}

export async function approveCentralPurchaseRequest(tx: Executor, actor: Identity, id: string) {
  assertOwner(actor);
  const [request] = await tx.select().from(centralPurchaseRequests).where(eq(centralPurchaseRequests.id, id)).limit(1);
  if (!request) throw new HttpError(404, "Central purchase request not found");
  if (request.status !== "PENDING_APPROVAL") throw new HttpError(409, "Request already decided or already consumed");
  await tx.update(centralPurchaseRequests).set({ status: "APPROVED", approvedById: actor.id, approvedAt: new Date() }).where(eq(centralPurchaseRequests.id, id));
  const [row] = await tx.select().from(centralPurchaseRequests).where(eq(centralPurchaseRequests.id, id));
  return row;
}

export async function rejectCentralPurchaseRequest(tx: Executor, actor: Identity, id: string) {
  assertOwner(actor);
  const [request] = await tx.select().from(centralPurchaseRequests).where(eq(centralPurchaseRequests.id, id)).limit(1);
  if (!request) throw new HttpError(404, "Central purchase request not found");
  if (request.status !== "PENDING_APPROVAL") throw new HttpError(409, "Request already decided or already consumed");
  await tx.update(centralPurchaseRequests).set({ status: "REJECTED", approvedById: actor.id, approvedAt: new Date() }).where(eq(centralPurchaseRequests.id, id));
  const [row] = await tx.select().from(centralPurchaseRequests).where(eq(centralPurchaseRequests.id, id));
  return row;
}

async function assertRequestConsumable(tx: Executor, requestId: string, warehouseId: string, vendorId: string, lines: CentralLineInput[], valueTsh: string) {
  const [request] = await tx.select().from(centralPurchaseRequests).where(eq(centralPurchaseRequests.id, requestId)).limit(1);
  if (!request) throw new HttpError(400, "Central purchase request not found");
  if (request.status !== "APPROVED") throw new HttpError(409, `Central purchase request is ${request.status}, not an approved, consumable request`);
  if (request.warehouseId !== warehouseId || request.vendorId !== vendorId) throw new HttpError(400, "Request does not match this warehouse/vendor");
  if (request.valueTsh !== valueTsh || !linesEqual(request.linesJson as CentralLineInput[], lines)) throw new HttpError(409, "Lines/value no longer match the approved request — submit a new request");
  await tx.update(centralPurchaseRequests).set({ status: "CONSUMED" }).where(and(eq(centralPurchaseRequests.id, requestId), eq(centralPurchaseRequests.status, "APPROVED")));
}

// --- Step 1: Buy (create the Central PO from an APPROVED request) ---------

export async function createCentralPurchaseOrder(tx: Executor, actor: Identity, warehouseId: string, vendorId: string, requestId: string, lines: CentralLineInput[]) {
  assertCentralStoreAccess(actor);
  assertModule(actor, "PURCHASE_ORDER");
  await assertCentralWarehouse(tx, warehouseId);
  const valueTsh = computeCentralPurchaseValueTsh(lines);
  await assertRequestConsumable(tx, requestId, warehouseId, vendorId, lines, valueTsh);

  const id = randomUUID();
  const poNumber = generatePoNumber();
  await tx.insert(centralPurchaseOrders).values({ id, poNumber, warehouseId, vendorId, requestId, createdById: actor.id, status: "CREATED", boughtAt: new Date() });
  await tx.insert(centralPurchaseOrderLines).values(lines.map((l) => ({ id: randomUUID(), poId: id, rawMaterialId: l.rawMaterialId, qty: l.qty, rate: l.rate })));
  const [row] = await tx.select().from(centralPurchaseOrders).where(eq(centralPurchaseOrders.id, id));
  return { purchaseOrder: row, lines };
}

export function assertCentralPoNotBilled(billUploadedAt: Date | null) {
  if (billUploadedAt) throw new HttpError(409, "Bill already recorded for this Central purchase order");
}
export function assertCentralPoNotReceived(materialReceivedAt: Date | null) {
  if (materialReceivedAt) throw new HttpError(409, "Material already received for this Central purchase order");
}

// --- Step 3: Material Receive (creates a GRN, no stock posted yet) --------

export async function receiveCentralPo(tx: Executor, actor: Identity, poId: string) {
  assertCentralStoreAccess(actor);
  assertModule(actor, "PURCHASE_ORDER");
  const [po] = await tx.select().from(centralPurchaseOrders).where(eq(centralPurchaseOrders.id, poId)).limit(1);
  if (!po) throw new HttpError(404, "Central purchase order not found");
  assertCentralPoNotReceived(po.materialReceivedAt);
  const lines = await tx.select().from(centralPurchaseOrderLines).where(eq(centralPurchaseOrderLines.poId, poId));
  if (!lines.length) throw new Error("Central purchase order has no lines");

  const grnId = randomUUID();
  await tx.insert(centralGrns).values({ id: grnId, poId, warehouseId: po.warehouseId, receivedById: actor.id, qualityResult: "PENDING" });
  await tx.insert(centralGrnLines).values(lines.map((l) => ({ id: randomUUID(), grnId, rawMaterialId: l.rawMaterialId, qtyOrdered: l.qty, qtyReceived: l.qty, rateOrdered: l.rate })));
  await tx.update(centralPurchaseOrders).set({ materialReceivedAt: new Date(), status: "RECEIVED" }).where(eq(centralPurchaseOrders.id, poId));

  const [grn] = await tx.select().from(centralGrns).where(eq(centralGrns.id, grnId));
  const grnLines = await tx.select().from(centralGrnLines).where(eq(centralGrnLines.grnId, grnId));
  return { grn, lines: grnLines };
}

// --- Quality check: PASS/FAIL/PARTIAL -> credits Central warehouse stock --

export interface CentralQualityLineInput { lineId: string; qtyFailed: string }
export async function recordCentralGrnQuality(tx: Executor, actor: Identity, grnId: string, result: "PASS" | "FAIL" | "PARTIAL", note: string, failedLines: CentralQualityLineInput[]) {
  assertCentralStoreAccess(actor);
  assertModule(actor, "PURCHASE_ORDER");
  assertModule(actor, "INVENTORY");
  const [grn] = await tx.select().from(centralGrns).where(eq(centralGrns.id, grnId)).limit(1);
  if (!grn) throw new HttpError(404, "Central GRN not found");
  if (grn.qualityResult !== "PENDING") throw new HttpError(409, "Quality already recorded for this GRN");
  const lines = await tx.select().from(centralGrnLines).where(eq(centralGrnLines.grnId, grnId));
  if (result !== "PASS" && !failedLines.length) throw new HttpError(400, "FAIL/PARTIAL requires at least one failed line");
  if (result === "PASS" && failedLines.length) throw new HttpError(400, "PASS cannot have failed lines");

  const failedByLine = new Map(failedLines.map((f) => [f.lineId, f.qtyFailed]));
  for (const line of lines) {
    const qtyFailed = failedByLine.get(line.id);
    if (qtyFailed === undefined) continue;
    if (quantity(qtyFailed, true) > quantity(line.qtyReceived, true)) throw new HttpError(400, `qtyFailed exceeds qtyReceived for line ${line.id}`);
    await tx.update(centralGrnLines).set({ qtyFailed }).where(eq(centralGrnLines.id, line.id));
  }

  for (const line of lines) {
    const qtyFailed = failedByLine.get(line.id) ?? "0";
    const accepted = quantity(line.qtyReceived, true) - quantity(qtyFailed, true);
    if (accepted > 0n) {
      await creditWarehouseStock(tx, grn.warehouseId, line.rawMaterialId, decimal(accepted));
      await creditLocatedBatch(tx, { warehouseId: grn.warehouseId }, line.rawMaterialId, decimal(accepted), parseBatchInput({}, false), { actorId: actor.id, sourceType: "CENTRAL_GRN", sourceId: grnId }, { unitCostTsh: line.rateOrdered });
    }
  }

  await tx.update(centralGrns).set({ qualityResult: result, qualityNote: note }).where(eq(centralGrns.id, grnId));
  const [updated] = await tx.select().from(centralGrns).where(eq(centralGrns.id, grnId));
  const updatedLines = await tx.select().from(centralGrnLines).where(eq(centralGrnLines.grnId, grnId));
  return { grn: updated, lines: updatedLines };
}

// --- Vendor invoice + 3-way match ------------------------------------------

export interface CreateCentralInvoiceDocument { blobPathname: string; contentType: string }
export async function createCentralVendorInvoice(tx: Executor, actor: Identity, poId: string, input: Record<string, unknown>, document: CreateCentralInvoiceDocument) {
  assertCentralStoreAccess(actor);
  assertModule(actor, "PURCHASE_ORDER");
  const [po] = await tx.select().from(centralPurchaseOrders).where(eq(centralPurchaseOrders.id, poId)).limit(1);
  if (!po) throw new HttpError(404, "Central purchase order not found");
  if (po.status !== "RECEIVED") throw new HttpError(409, "Material must be received before recording an invoice");
  const [grn] = await tx.select().from(centralGrns).where(eq(centralGrns.poId, poId)).limit(1);
  if (!grn || grn.qualityResult === "PENDING") throw new HttpError(409, "Quality check must be recorded before recording an invoice");
  const [existing] = await tx.select({ id: centralVendorInvoices.id }).from(centralVendorInvoices).where(eq(centralVendorInvoices.poId, poId)).limit(1);
  if (existing) throw new HttpError(409, "An invoice is already recorded for this purchase order");

  const parsed = parseInvoiceInput(input);
  const poLines = await tx.select({ qty: centralPurchaseOrderLines.qty, rate: centralPurchaseOrderLines.rate }).from(centralPurchaseOrderLines).where(eq(centralPurchaseOrderLines.poId, poId));
  const grnLines = await tx.select({ qtyReceived: centralGrnLines.qtyReceived, qtyFailed: centralGrnLines.qtyFailed, rateOrdered: centralGrnLines.rateOrdered }).from(centralGrnLines).where(eq(centralGrnLines.grnId, grn.id));
  const match = computeThreeWayMatch({ poLines, grnLines, invoiceAmount: parsed.amount, taxAdjustmentInr: parsed.taxAdjustmentInr });

  const invoiceId = randomUUID();
  await tx.insert(centralVendorInvoices).values({
    id: invoiceId, poId, warehouseId: po.warehouseId, vendorId: po.vendorId,
    invoiceNumber: parsed.invoiceNumber, amount: parsed.amount, taxAdjustmentInr: parsed.taxAdjustmentInr, taxAdjustmentNote: parsed.taxAdjustmentNote,
    blobPathname: document.blobPathname, contentType: document.contentType, submittedById: actor.id,
  });
  const matchId = randomUUID();
  await tx.insert(centralThreeWayMatch).values({
    id: matchId, warehouseId: po.warehouseId, poId, grnId: grn.id, invoiceId,
    poTotalInr: match.poTotalInr, grnAcceptedTotalInr: match.grnAcceptedTotalInr, invoiceAdjustedTotalInr: match.invoiceAdjustedTotalInr,
    matched: match.matched, mismatchReason: match.mismatchReason,
    paymentStatus: match.matched ? "PENDING" : "THREE_WAY_LOCKED", lockedAt: match.matched ? null : new Date(),
  });
  const [invoice] = await tx.select().from(centralVendorInvoices).where(eq(centralVendorInvoices.id, invoiceId));
  const [matchRow] = await tx.select().from(centralThreeWayMatch).where(eq(centralThreeWayMatch.invoiceId, invoiceId));
  return { invoice, match: matchRow };
}

export async function readCentralPoInvoice(tx: Executor, poId: string) {
  const [invoice] = await tx.select().from(centralVendorInvoices).where(eq(centralVendorInvoices.poId, poId)).limit(1);
  if (!invoice) return { invoice: null, match: null };
  const [match] = await tx.select().from(centralThreeWayMatch).where(eq(centralThreeWayMatch.invoiceId, invoice.id)).limit(1);
  return { invoice, match: match ?? null };
}

export async function approveCentralThreeWayPayment(tx: Executor, actor: Identity, poId: string) {
  assertCentralStoreAccess(actor);
  assertModule(actor, "ACCOUNTS_EXPENSES");
  const [row] = await tx.select().from(centralThreeWayMatch).where(eq(centralThreeWayMatch.poId, poId)).limit(1);
  if (!row) throw new HttpError(404, "No invoice/3-way match recorded for this purchase order");
  if (!row.matched) throw new HttpError(409, "PO, GRN and invoice do not match; cannot approve payment");
  if (row.paymentStatus !== "PENDING") throw new HttpError(409, `Payment is already ${row.paymentStatus}`);
  await tx.update(centralThreeWayMatch).set({ paymentStatus: "APPROVED", approvedById: actor.id, approvedAt: new Date() }).where(eq(centralThreeWayMatch.id, row.id));
  const [updated] = await tx.select().from(centralThreeWayMatch).where(eq(centralThreeWayMatch.id, row.id));
  return { match: updated };
}

// Single state-flip evidence (amount/date/method not separately captured in
// v1 — see the schema file's comment on why this is simpler than GAP-017's
// vendor-payments.ts). Owner/Accounts can extend to full evidence later.
export async function markCentralThreeWayPaid(tx: Executor, actor: Identity, poId: string) {
  assertCentralStoreAccess(actor);
  assertModule(actor, "ACCOUNTS_EXPENSES");
  const [row] = await tx.select().from(centralThreeWayMatch).where(eq(centralThreeWayMatch.poId, poId)).limit(1);
  if (!row) throw new HttpError(404, "No invoice/3-way match recorded for this purchase order");
  if (row.paymentStatus !== "APPROVED") throw new HttpError(409, "Payment must be APPROVED before it can be marked paid");
  await tx.update(centralThreeWayMatch).set({ paymentStatus: "PAID", paidById: actor.id, paidAt: new Date() }).where(eq(centralThreeWayMatch.id, row.id));
  const [updated] = await tx.select().from(centralThreeWayMatch).where(eq(centralThreeWayMatch.id, row.id));
  return { match: updated };
}
