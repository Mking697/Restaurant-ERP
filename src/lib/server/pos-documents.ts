import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { branches } from "../../db/schema/platform";
import { settings } from "../../db/schema/settings";
import { menuItems } from "../../db/schema/menu";
import { currencyRates } from "../../db/schema/currency";
import { posDrafts } from "../../db/schema/pos-lifecycle";
import { posOrders, posOrderLines, posReceipts } from "../../db/schema/pos";
import { posDocuments, posDocumentRequests } from "../../db/schema/pos-documents";
import { POS_DOCUMENT_DISCLAIMER, type Document, type DocumentSummary } from "../pos-documents";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { assertAllowedFields, parsePolicyLines, sameReplayPayload } from "./pos-order-policy";
import { revisionGuard } from "./pos-lifecycle-policy";
import { vatInvoiceSummary } from "./vat";
import { documentNumber, sameDocumentEvidence } from "./pos-document-policy";

type SourceType = Document["sourceType"];
function sourceType(value: unknown): SourceType {
  if (value !== "DRAFT" && value !== "ORDER") throw new HttpError(400, "Invalid sourceType");
  return value;
}
function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new HttpError(400, `Invalid ${field}`);
  return value;
}
async function visibleOrder(tx: Executor, actor: Identity, id: string) {
  const [row] = await tx.select().from(posOrders).where(eq(posOrders.id, id)).limit(1);
  if (!row || (row.ownerOnly && actor.role !== "SUPER_ADMIN")) throw new HttpError(404, "Order not found");
  branchScope(actor, row.branchId);
  return row;
}
async function source(tx: Executor, actor: Identity, type: SourceType, id: string) {
  assertModule(actor, "POS_CASHIER");
  if (type === "ORDER") return visibleOrder(tx, actor, id);
  const [row] = await tx.select().from(posDrafts).where(eq(posDrafts.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Draft not found");
  branchScope(actor, row.branchId);
  if (row.orderId) await visibleOrder(tx, actor, row.orderId);
  return row;
}
async function authorizeDocument(tx: Executor, actor: Identity, row: typeof posDocuments.$inferSelect) {
  assertModule(actor, "POS_CASHIER"); branchScope(actor, row.branchId);
  const target = await source(tx, actor, row.sourceType, row.sourceId);
  if (target.branchId !== row.branchId) throw new HttpError(404, "Document not found");
  if (row.orderId) await visibleOrder(tx, actor, row.orderId);
}
export async function readPosDocument(tx: Executor, actor: Identity, id: string): Promise<{ document: Document }> {
  assertModule(actor, "POS_CASHIER");
  const [row] = await tx.select().from(posDocuments).where(eq(posDocuments.id, identifier(id, "document id"))).limit(1);
  if (!row) throw new HttpError(404, "Document not found");
  await authorizeDocument(tx, actor, row);
  return { document: structuredClone(row.snapshot) };
}
function lineTotal(price: string, qty: number): string {
  if (!/^\d+(?:\.\d{1,2})?$/.test(price) || !Number.isSafeInteger(qty) || qty <= 0) throw new HttpError(409, "Invalid source line snapshot");
  const [whole, fraction = ""] = price.split(".");
  const amount = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * BigInt(qty);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}
async function seller(tx: Executor, branchId: string) {
  const [branch] = await tx.select().from(branches).where(eq(branches.id, branchId)).limit(1);
  if (!branch) throw new HttpError(404, "Branch not found");
  const [setting] = await tx.select().from(settings).where(eq(settings.key, "RESTAURANT_NAME")).limit(1);
  return { branch, seller: { name: setting?.value?.trim() || branch.name, branchName: branch.name, branchCode: branch.code, address: branch.address, tin: null, vrn: null } };
}
async function draftEvidence(tx: Executor, branchId: string, value: unknown, override: string | null) {
  const payload = value as Record<string, unknown>;
  const lines: Document["lines"] = [];
  for (const line of parsePolicyLines(payload.lines)) {
    const [item] = await tx.select().from(menuItems).where(eq(menuItems.id, line.menuItemId)).limit(1);
    if (!item || item.branchId !== branchId || !item.isActive || !item.isSellable) throw new HttpError(409, "Draft requires current sellable same-branch items");
    lines.push({ ...line, name: item.name, productCode: item.productCode, price: item.price, vatRatePercent: override ?? item.vatRatePercent, lineTotal: lineTotal(item.price, line.qty) });
  }
  const vat = vatInvoiceSummary(lines.map(l => ({ taxableAmountDecimal: l.lineTotal, ratePercent: l.vatRatePercent })));
  const code = typeof payload.tenderCurrencyCode === "string" ? payload.tenderCurrencyCode.trim().toUpperCase() : "INR";
  let rate = "1.000000";
  if (code !== "INR") {
    const [fx] = await tx.select().from(currencyRates).where(eq(currencyRates.currencyCode, code)).limit(1);
    if (!fx || !Number.isFinite(Number(fx.rateToInr)) || Number(fx.rateToInr) <= 0) throw new HttpError(409, "Draft exchange rate unavailable");
    rate = Number(fx.rateToInr).toFixed(6);
  }
  return { lines, vat, subtotal: vat.grandTaxable, taxAmount: vat.grandTotalTax, totalAmount: vat.grandTotal, currency: { baseCode: "TZS" as const, tenderCurrencyCode: code, fxRateToInr: rate, tenderCurrencyAmount: code === "INR" ? vat.grandTotal : (Number(vat.grandTotal) / Number(rate)).toFixed(2) } };
}
async function orderEvidence(tx: Executor, order: typeof posOrders.$inferSelect) {
  const rows = await tx.select().from(posOrderLines).where(eq(posOrderLines.orderId, order.id)).orderBy(asc(posOrderLines.id));
  if (!rows.length || rows.some(l => l.nameSnapshot == null || l.productCodeSnapshot == null || l.vatRatePercent == null)) return null;
  const lines: Document["lines"] = rows.map(l => ({ orderLineId: l.id, menuItemId: l.menuItemId, name: l.nameSnapshot!, productCode: l.productCodeSnapshot!, qty: l.qty, price: l.price, vatRatePercent: l.vatRatePercent!, lineTotal: lineTotal(l.price, l.qty) }));
  const vat = vatInvoiceSummary(lines.map(l => ({ taxableAmountDecimal: l.lineTotal, ratePercent: l.vatRatePercent })));
  if (vat.grandTaxable !== order.subtotal || vat.grandTotalTax !== order.taxAmount || vat.grandTotal !== order.totalAmount) return null;
  return { lines, vat, subtotal: order.subtotal, taxAmount: order.taxAmount, totalAmount: order.totalAmount, currency: { baseCode: "TZS" as const, tenderCurrencyCode: order.tenderCurrencyCode, fxRateToInr: order.fxRateToInr, tenderCurrencyAmount: order.status === "OPEN" ? (Number(order.totalAmount) / Number(order.fxRateToInr)).toFixed(2) : order.tenderCurrencyAmount } };
}
async function persist(tx: Executor, value: Omit<Document, "id" | "number" | "issuedAt" | "disclaimer">): Promise<Document> {
  const issuedAt = new Date();
  const result = await tx.execute<{ value: string }>(sql`select nextval('pos_document_number_seq')::text as value`);
  const sequence = result.rows[0]?.value;
  const document: Document = { ...value, id: randomUUID(), issuedAt: issuedAt.toISOString(), number: documentNumber(value.kind, value.seller.branchCode, issuedAt, sequence), disclaimer: POS_DOCUMENT_DISCLAIMER };
  await tx.insert(posDocuments).values({ id: document.id, branchId: document.branchId, kind: document.kind, number: document.number, issuedAt, sourceType: document.sourceType, sourceId: document.sourceId, sourceRevision: document.sourceRevision, orderId: document.orderId, proformaId: document.proformaId, snapshot: document });
  return structuredClone(document);
}
export async function issueProformaPosDocument(tx: Executor, actor: Identity, input: Record<string, unknown>): Promise<{ document: Document; replayed?: true }> {
  assertModule(actor, "POS_CASHIER");
  assertAllowedFields(input, ["sourceType", "sourceId", "expectedRevision", "requestKey"]);
  const type = sourceType(input.sourceType), id = identifier(input.sourceId, "sourceId");
  if (typeof input.requestKey !== "string" || !input.requestKey.trim() || input.requestKey.length > 128) throw new HttpError(400, "Invalid requestKey");
  // Lock the actual source row so revision and billed evidence cannot change during capture.
  await tx.execute(type === "DRAFT" ? sql`select id from pos_drafts where id = ${id} for update` : sql`select id from pos_orders where id = ${id} for update`);
  const live = await source(tx, actor, type, id);
  if (!live.branchId) throw new HttpError(400, "Explicit branch required");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pos-document:${live.branchId}:${input.requestKey}`}))`);
  const [saved] = await tx.select().from(posDocumentRequests).where(and(eq(posDocumentRequests.branchId, live.branchId), eq(posDocumentRequests.requestKey, input.requestKey))).limit(1);
  if (saved) {
    await source(tx, actor, saved.sourceType, saved.sourceId);
    if (saved.actorId !== actor.id || saved.sourceType !== type || saved.sourceId !== id || saved.expectedRevision !== input.expectedRevision || !sameReplayPayload(saved.requestJson, input)) throw new HttpError(409, "requestKey was used for a different document request");
    return { ...await readPosDocument(tx, actor, saved.documentId), replayed: true };
  }
  revisionGuard(live.revision, input.expectedRevision);
  if (type === "DRAFT" ? (live as typeof posDrafts.$inferSelect).status !== "DRAFT" : (live as typeof posOrders.$inferSelect).status !== "OPEN" || (live as typeof posOrders.$inferSelect).serviceStatus !== "ACTIVE") throw new HttpError(409, "Source no longer accepts proforma documents");
  const { branch, seller: sellerSnapshot } = await seller(tx, live.branchId);
  const order = type === "ORDER" ? live as typeof posOrders.$inferSelect : null;
  const payload = type === "DRAFT" ? (live as typeof posDrafts.$inferSelect).payload as Record<string, unknown> : order!;
  const evidence = order ? await orderEvidence(tx, order) : await draftEvidence(tx, live.branchId, payload, branch.vatRatePercent);
  if (!evidence) throw new HttpError(409, "Original line snapshots unavailable; legacy receipt only");
  const name = typeof payload.customerName === "string" ? payload.customerName : "", phone = typeof payload.customerPhone === "string" ? payload.customerPhone : "";
  const document = await persist(tx, { branchId: live.branchId, kind: "PROFORMA", sourceType: type, sourceId: id, sourceRevision: live.revision, orderId: order?.id ?? null, proformaId: null, receiptNumber: null, seller: sellerSnapshot, customer: name || phone ? { name, phone } : null, orderNumber: order?.orderNumber ?? null, tableNo: typeof payload.tableNo === "string" ? payload.tableNo : "", channel: String(payload.channel), ...evidence });
  await tx.insert(posDocumentRequests).values({ id: randomUUID(), branchId: live.branchId, actorId: actor.id, requestKey: input.requestKey, sourceType: type, sourceId: id, expectedRevision: live.revision, requestJson: input, documentId: document.id });
  return { document };
}

export async function issueFinalPosDocument(tx: Executor, actor: Identity, orderId: string, context?: { draftId: string; draftRevision: number }): Promise<{ document: Document | null; unavailableReason?: string }> {
  assertModule(actor, "POS_CASHIER");
  const order = await visibleOrder(tx, actor, orderId);
  if (order.status !== "PAID") throw new HttpError(409, "FINAL requires a paid order");
  const [receipt] = await tx.select().from(posReceipts).where(eq(posReceipts.orderId, orderId)).limit(1);
  if (!receipt) throw new HttpError(409, "FINAL requires the saved receipt");
  const [existing] = await tx.select().from(posDocuments).where(and(eq(posDocuments.orderId, orderId), eq(posDocuments.kind, "FINAL"))).limit(1);
  if (existing) { await authorizeDocument(tx, actor, existing); return { document: structuredClone(existing.snapshot) }; }
  const evidence = await orderEvidence(tx, order);
  if (!evidence) return { document: null, unavailableReason: "Original line/amount snapshots unavailable; legacy receipt only" };
  const { seller: sellerSnapshot } = await seller(tx, order.branchId);
  const candidates = await tx.select().from(posDocuments).where(and(eq(posDocuments.branchId, order.branchId), eq(posDocuments.kind, "PROFORMA"))).orderBy(asc(posDocuments.issuedAt), asc(posDocuments.id));
  // Settlement alone advances the order revision; previous ACTIVE/OPEN evidence is applicable.
  const sources = new Map<string, number>([[`ORDER:${orderId}`, order.revision - 1]]);
  const drafts = await tx.select().from(posDrafts).where(eq(posDrafts.orderId, orderId));
  for (const draft of drafts) if (draft.status === "DISPATCHED") sources.set(`DRAFT:${draft.id}`, draft.revision - 1);
  if (context) {
    const draft = await source(tx, actor, "DRAFT", context.draftId) as typeof posDrafts.$inferSelect;
    if (draft.branchId !== order.branchId || draft.revision !== context.draftRevision || draft.status !== "DRAFT" || draft.orderId) throw new HttpError(409, "Invalid internal draft source context");
    sources.set(`DRAFT:${context.draftId}`, context.draftRevision);
  }
  const applicable = candidates.filter(row => sources.get(`${row.sourceType}:${row.sourceId}`) === row.sourceRevision && sameDocumentEvidence(row.snapshot, evidence));
  const proformaId = applicable.at(-1)?.id ?? null;
  const document = await persist(tx, { branchId: order.branchId, kind: "FINAL", sourceType: "ORDER", sourceId: orderId, sourceRevision: order.revision, orderId, proformaId, receiptNumber: receipt.receiptNumber, seller: sellerSnapshot, customer: order.customerName || order.customerPhone ? { name: order.customerName, phone: order.customerPhone } : null, orderNumber: order.orderNumber, tableNo: order.tableNo, channel: order.channel, ...evidence });
  return { document };
}

export const POS_DOCUMENT_LIMIT = 200;
export const POS_DOCUMENT_LEGACY_NOTICE = "Legacy receipts without original snapshots are read-only; no verified internal document is available.";
export async function listPosDocuments(tx: Executor, actor: Identity, options: { branchId?: unknown; sourceType?: unknown; sourceId?: unknown } = {}) {
  assertModule(actor, "POS_CASHIER");
  const scope = branchScope(actor, options.branchId === undefined ? undefined : identifier(options.branchId, "branchId"));
  const paired = options.sourceType !== undefined || options.sourceId !== undefined;
  const type = paired ? sourceType(options.sourceType) : undefined, id = paired ? identifier(options.sourceId, "sourceId") : undefined;
  if (type && id) { const live = await source(tx, actor, type, id); if (scope && live.branchId !== scope) throw new HttpError(404, "Source not found"); }
  // Subqueries stay in PostgreSQL: no unbounded IDs/documents or N+1 reads.
  // Both source authority and a draft's CURRENT linked-order privacy precede LIMIT.
  const visibleOrders = tx.select({ id: posOrders.id }).from(posOrders).where(and(scope ? eq(posOrders.branchId, scope) : undefined, actor.role === "SUPER_ADMIN" ? undefined : eq(posOrders.ownerOnly, false)));
  const visibleDrafts = tx.select({ id: posDrafts.id }).from(posDrafts).where(and(scope ? eq(posDrafts.branchId, scope) : undefined, or(isNull(posDrafts.orderId), inArray(posDrafts.orderId, visibleOrders))));
  const rows = await tx.select().from(posDocuments).where(and(
    scope ? eq(posDocuments.branchId, scope) : undefined,
    type ? eq(posDocuments.sourceType, type) : undefined,
    id ? eq(posDocuments.sourceId, id) : undefined,
    or(and(eq(posDocuments.sourceType, "ORDER"), inArray(posDocuments.sourceId, visibleOrders)), and(eq(posDocuments.sourceType, "DRAFT"), inArray(posDocuments.sourceId, visibleDrafts))),
    or(isNull(posDocuments.orderId), inArray(posDocuments.orderId, visibleOrders)),
  )).orderBy(desc(posDocuments.issuedAt), desc(posDocuments.id)).limit(POS_DOCUMENT_LIMIT + 1);
  const visible: DocumentSummary[] = rows.slice(0, POS_DOCUMENT_LIMIT).map(row => {
    const d = row.snapshot;
    return { id: d.id, branchId: d.branchId, kind: d.kind, number: d.number, issuedAt: d.issuedAt, sourceType: d.sourceType, sourceId: d.sourceId, sourceRevision: d.sourceRevision, orderId: d.orderId, proformaId: d.proformaId, receiptNumber: d.receiptNumber, totalAmount: d.totalAmount, currency: structuredClone(d.currency) };
  });
  return { documents: visible, visibilityScope: actor.role === "SUPER_ADMIN" ? "actual" as const : "access-filtered" as const, limit: POS_DOCUMENT_LIMIT, truncated: rows.length > POS_DOCUMENT_LIMIT, legacyNotice: POS_DOCUMENT_LEGACY_NOTICE };
}
