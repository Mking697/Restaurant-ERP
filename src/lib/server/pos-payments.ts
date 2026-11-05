import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { posOrders, posReceipts } from "../../db/schema/pos";
import { posDocuments } from "../../db/schema/pos-documents";
import { posPayments, posPaymentAllocations } from "../../db/schema/pos-payments";
import type { Payment } from "../pos-payments";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";

type Order = typeof posOrders.$inferSelect;
type Evidence = { payments: (typeof posPayments.$inferSelect)[]; allocations: (typeof posPaymentAllocations.$inferSelect)[]; receipts: (typeof posReceipts.$inferSelect)[]; finals: (typeof posDocuments.$inferSelect)[] };
const unavailable = () => new HttpError(409, 'Collection evidence missing or inconsistent');
function money(value: string): string {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw unavailable();
  const [whole, fraction = ''] = value.split('.');
  return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
}
export async function readPosPaymentEvidence(tx: Executor, ids: string[]): Promise<Evidence> {
  if (!ids.length) return { payments: [], allocations: [], receipts: [], finals: [] };
  const payments = await tx.select().from(posPayments).where(inArray(posPayments.orderId, ids));
  const allocations = await tx.select().from(posPaymentAllocations).where(inArray(posPaymentAllocations.orderId, ids));
  const receipts = await tx.select().from(posReceipts).where(inArray(posReceipts.orderId, ids));
  const finals = await tx.select().from(posDocuments).where(and(inArray(posDocuments.orderId, ids), eq(posDocuments.kind, 'FINAL')));
  return {payments, allocations, receipts, finals};
}
export function verifiedPosPayment(order: Order, evidence: Evidence): Payment {
  const payments = evidence.payments.filter(p => p.orderId === order.id), allocations = evidence.allocations.filter(a => a.orderId === order.id), receipts = evidence.receipts.filter(r => r.orderId === order.id), finals = evidence.finals.filter(f => f.orderId === order.id);
  if (!order.paymentCaptured || !['PAID', 'COMPLETED'].includes(order.status) || payments.length !== 1 || allocations.length !== 1 || receipts.length !== 1 || finals.length > 1) throw unavailable();
  const p = payments[0], a = allocations[0], r = receipts[0], f = finals[0];
  if (p.branchId !== order.branchId || r.branchId !== order.branchId || p.receiptId !== r.id || p.receiptNumber !== r.receiptNumber || a.paymentId !== p.id || a.receiptId !== r.id || money(p.amount) !== money(order.totalAmount) || money(a.amount) !== money(p.amount) || p.tenderType !== order.tenderType || p.tenderCurrencyCode !== order.tenderCurrencyCode || money(p.tenderCurrencyAmount) !== money(order.tenderCurrencyAmount) || p.fxRateToInr !== order.fxRateToInr || !Number.isFinite(Number(p.fxRateToInr)) || Number(p.fxRateToInr) <= 0 || p.shiftRunId !== order.shiftRunId || !p.collectorId || !p.collectorName?.trim() || !['CREATE','SETTLE'].includes(p.sourceAction) || !['CASH','UPI','CARD','SWIGGY','ZOMATO'].includes(p.tenderType) || !/^[A-Z]{3}$/.test(p.tenderCurrencyCode) || p.finalDocumentId !== (f?.id ?? null) || p.finalDocumentNumber !== (f?.number ?? null) || a.finalDocumentId !== p.finalDocumentId) throw unavailable();
  if (f && (f.branchId !== order.branchId || f.sourceType !== 'ORDER' || f.sourceId !== order.id || f.snapshot.orderId !== order.id || f.snapshot.receiptNumber !== r.receiptNumber || money(f.snapshot.totalAmount) !== money(p.amount))) throw unavailable();
  const date = new Date(p.collectedAt); if (!Number.isFinite(date.getTime())) throw unavailable();
  return {id:p.id,branchId:p.branchId,orderId:p.orderId,receiptId:p.receiptId,receiptNumber:p.receiptNumber,amount:money(p.amount),tenderType:p.tenderType,tenderCurrencyCode:p.tenderCurrencyCode,tenderCurrencyAmount:p.tenderCurrencyAmount,fxRateToInr:p.fxRateToInr,collectorId:p.collectorId,collectorName:p.collectorName,shiftRunId:p.shiftRunId,collectedAt:date.toISOString(),sourceAction:p.sourceAction,finalDocumentId:p.finalDocumentId,finalDocumentNumber:p.finalDocumentNumber,allocation:{id:a.id,orderId:a.orderId,receiptId:a.receiptId,finalDocumentId:a.finalDocumentId,amount:money(a.amount)}};
}
export async function listPosPayments(tx: Executor, actor: Identity, options: {branchId?: unknown; orderId?: unknown} = {}): Promise<import('../pos-payments').PaymentList> {
  assertModule(actor, 'POS_CASHIER');
  function identifier(v: unknown): string { if (typeof v !== 'string' || !v.trim() || v.length > 128) throw new HttpError(400,'Invalid identifier'); return v; }
  const scope = branchScope(actor, options.branchId === undefined ? undefined : identifier(options.branchId));
  const id = options.orderId === undefined ? undefined : identifier(options.orderId);
  const rows = await tx.select().from(posOrders).where(and(scope ? eq(posOrders.branchId,scope) : undefined, id ? eq(posOrders.id,id) : undefined, actor.role === 'SUPER_ADMIN' ? undefined : eq(posOrders.ownerOnly,false), inArray(posOrders.status,['OPEN','PAID','COMPLETED']))).orderBy(desc(posOrders.createdAt),desc(posOrders.id)).limit(201);
  if (id && !rows.length) throw new HttpError(404,'Order not found');
  const orders = rows.slice(0,200), evidence = await readPosPaymentEvidence(tx,orders.map(o=>o.id));
  const summaries = orders.map(o => {
    const base = {id:o.id,branchId:o.branchId,orderNumber:o.orderNumber,status:o.status as 'OPEN'|'PAID'|'COMPLETED',totalAmount:o.totalAmount,collectedAmount:null as string|null,outstandingAmount:null as string|null,legacyRecordedAmount:null as string|null,unavailableReason:null as string|null,payment:null as Payment|null};
    try {
      if (o.paymentCaptured) { const payment=verifiedPosPayment(o,evidence); return {...base,coverage:'CAPTURED' as const,collectedAmount:payment.amount,outstandingAmount:'0.00',payment}; }
      if (evidence.payments.some(p=>p.orderId===o.id) || evidence.allocations.some(a=>a.orderId===o.id)) throw unavailable();
      if (o.status==='OPEN') return {...base,coverage:'OPEN' as const,collectedAmount:'0.00',outstandingAmount:money(o.totalAmount)};
      return {...base,coverage:'LEGACY' as const,legacyRecordedAmount:o.totalAmount};
    } catch { return {...base,coverage:'UNAVAILABLE' as const,unavailableReason:'Collection evidence missing or inconsistent'}; }
  });
  return {orders:summaries,visibilityScope:actor.role==='SUPER_ADMIN'?'actual':'access-filtered',limit:200,truncated:rows.length>200,legacyNotice:'Legacy paid orders preserve recorded totals; historical collection and collector evidence is unavailable.'};
}

export async function capturePosPayment(tx: Executor, actor: Identity, orderId: string, sourceAction: 'CREATE' | 'SETTLE'): Promise<{payment: Payment}> {
  assertModule(actor, "POS_CASHIER");
  const [order] = await tx.select().from(posOrders).where(eq(posOrders.id, orderId)).limit(1);
  if (!order || (order.ownerOnly && actor.role !== 'SUPER_ADMIN')) throw new HttpError(404, 'Order not found');
  branchScope(actor, order.branchId);
  const [receipt] = await tx.select().from(posReceipts).where(eq(posReceipts.orderId, orderId)).limit(1);
  const [final] = await tx.select().from(posDocuments).where(and(eq(posDocuments.orderId, orderId), eq(posDocuments.kind, 'FINAL'))).limit(1);
  const payment = { id: randomUUID(), branchId: order.branchId, orderId, receiptId: receipt.id, receiptNumber: receipt.receiptNumber, amount: order.totalAmount, tenderType: order.tenderType, tenderCurrencyCode: order.tenderCurrencyCode, tenderCurrencyAmount: order.tenderCurrencyAmount, fxRateToInr: order.fxRateToInr, collectorId: actor.id, collectorName: actor.name, shiftRunId: order.shiftRunId, collectedAt: new Date(), sourceAction, finalDocumentId: final?.id ?? null, finalDocumentNumber: final?.number ?? null };
  const allocation = { id: randomUUID(), paymentId: payment.id, orderId, receiptId: receipt.id, finalDocumentId: payment.finalDocumentId, amount: payment.amount };
  await tx.insert(posPayments).values(payment);
  await tx.insert(posPaymentAllocations).values(allocation);
  await tx.update(posOrders).set({ paymentCaptured: true }).where(eq(posOrders.id, orderId));
  return {payment: {...payment, collectedAt: payment.collectedAt.toISOString(), allocation: {id: allocation.id, orderId, receiptId: allocation.receiptId, finalDocumentId: allocation.finalDocumentId, amount: allocation.amount}}};
}
