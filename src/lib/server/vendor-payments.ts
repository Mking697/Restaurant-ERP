import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { purchaseOrders, threeWayMatch, vendorPayments } from "../../db/schema/purchase";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { string } from "./http";

// GAP-017. Auditable vendor payment records — replaces the old
// markThreeWayPaid bare status flip with real payment evidence
// (amount/date/method/reference/actor). Full-payment-only this pass (see
// src/db/schema/purchase.ts's design note). Payment still cannot bypass
// the existing APPROVED-only gate — the quality/3-way-mismatch lock is
// unchanged.

const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function parseAmountCenti(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new HttpError(400, `Invalid ${label} (decimal string, up to 2 decimal places)`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function parsePaymentMethod(value: unknown): PaymentMethod {
  if (typeof value !== "string" || !PAYMENT_METHODS.includes(value as PaymentMethod)) throw new HttpError(400, `paymentMethod must be one of ${PAYMENT_METHODS.join(", ")}`);
  return value as PaymentMethod;
}
function parsePaidAt(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "Invalid paidAt (date string required)");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, "Invalid paidAt (not a valid date)");
  return date;
}

export async function recordVendorPayment(tx: Executor, actor: Identity, poId: string, input: Record<string, unknown>) {
  assertModule(actor, "ACCOUNTS_EXPENSES");
  const [po] = await tx.select({ branchId: purchaseOrders.branchId, vendorId: purchaseOrders.vendorId }).from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) throw new HttpError(404, "Purchase order not found");
  branchScope(actor, po.branchId);
  const [match] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.poId, poId)).limit(1);
  if (!match) throw new HttpError(404, "No invoice/3-way match recorded for this purchase order");

  const idempotencyKey = string(input.idempotencyKey, "idempotencyKey", 200);
  const amountTsh = string(input.amountTsh, "amountTsh", 20);
  const paymentMethod = parsePaymentMethod(input.paymentMethod);
  const referenceNumber = typeof input.referenceNumber === "string" ? input.referenceNumber.slice(0, 200) : "";
  const paidAt = parsePaidAt(input.paidAt);

  // Idempotent replay check comes BEFORE the APPROVED-status gate on
  // purpose: the first successful call already flips the match's status
  // to PAID, so a genuine replay of the SAME key must still succeed even
  // though the match is no longer APPROVED — it is not a new payment
  // attempt, just the same one being re-acknowledged. The SAME key with a
  // DIFFERENT payload is rejected (never silently overwrites a real
  // payment record).
  const [existingByKey] = await tx.select().from(vendorPayments).where(eq(vendorPayments.idempotencyKey, idempotencyKey)).limit(1);
  if (existingByKey) {
    const samePayload = existingByKey.poId === poId && existingByKey.amountTsh === amountTsh && existingByKey.paymentMethod === paymentMethod
      && existingByKey.referenceNumber === referenceNumber && existingByKey.paidAt.getTime() === paidAt.getTime();
    if (!samePayload) throw new HttpError(409, "idempotencyKey already used with a different payment payload");
    const [updatedMatch] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.id, match.id));
    return { payment: existingByKey, match: updatedMatch, replayed: true };
  }

  if (match.paymentStatus !== "APPROVED") throw new HttpError(409, "Payment must be APPROVED before it can be recorded as paid");

  // Full-payment-only: at most one payment record per match, EVER, and it
  // must cover the exact full invoiceAdjustedTotalInr liability — never a
  // partial allocation (GAP-001 left partial payments explicitly
  // unapproved; enforcing full-payment is the documented default).
  const [existingForMatch] = await tx.select({ id: vendorPayments.id }).from(vendorPayments).where(eq(vendorPayments.matchId, match.id)).limit(1);
  if (existingForMatch) throw new HttpError(409, "This purchase order's invoice has already been paid — duplicate allocation is not allowed");
  if (parseAmountCenti(amountTsh, "amountTsh") !== parseAmountCenti(match.invoiceAdjustedTotalInr, "invoiceAdjustedTotalInr")) {
    throw new HttpError(400, `amountTsh must exactly equal the outstanding invoice total (TSh ${match.invoiceAdjustedTotalInr}) — partial payments are not approved yet`);
  }

  const id = randomUUID();
  await tx.insert(vendorPayments).values({
    id, matchId: match.id, poId, branchId: po.branchId, vendorId: po.vendorId,
    amountTsh, paymentMethod, referenceNumber, paidAt, recordedById: actor.id, idempotencyKey,
  });
  await tx.update(threeWayMatch).set({ paymentStatus: "PAID", paidById: actor.id, paidAt: new Date() }).where(eq(threeWayMatch.id, match.id));
  const [payment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.id, id));
  const [updatedMatch] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.id, match.id));
  return { payment, match: updatedMatch, replayed: false };
}

export async function getPoPayment(tx: Executor, actor: Identity, poId: string) {
  const [po] = await tx.select({ branchId: purchaseOrders.branchId }).from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) throw new HttpError(404, "Purchase order not found");
  branchScope(actor, po.branchId);
  const [match] = await tx.select().from(threeWayMatch).where(eq(threeWayMatch.poId, poId)).limit(1);
  if (!match) return { payment: null };
  const [payment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.matchId, match.id)).limit(1);
  return { payment: payment ?? null };
}
