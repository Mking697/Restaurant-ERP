import { randomUUID } from "node:crypto";
import { issueFinalPosDocument } from "./pos-documents";
import { capturePosPayment } from "./pos-payments";
import { and, eq, inArray } from "drizzle-orm";
import { currencyRates } from "../../db/schema/currency";
import { menuItems } from "../../db/schema/menu";
import { branches } from "../../db/schema/platform";
import { posOrderAttempts, posOrderLines, posOrders, posProductionTicketLines, posProductionTickets, posReceipts } from "../../db/schema/pos";
import type { Executor } from "./auth";
import { computeOrderCogs } from "./cogs";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { deductStock, lockRecipeStock, readStockRecipe } from "./production";
import { directRequirements } from "./production-quantity";
import { requireOperableShift } from "./shifts";
import { allocatePickupToken } from "./pos-tokens";
import { vatInvoiceSummary } from "./vat";
import { validOptionalPhone } from "./whatsapp-triggers";
import { assertAllowedFields, idempotencyKey, orderFlow, parsePolicyLines, productionTickets, sameReplayPayload, tableNumber, type BranchConcept, type OrderChannel, type ProductionStation } from "./pos-order-policy";

const TENDERS = ["CASH", "UPI", "CARD", "SWIGGY", "ZOMATO"] as const;
const POS_COUNTERS = ["COUNTER_1", "COUNTER_2"] as const;
type Action = "CREATE" | "ADD_LINES" | "SETTLE";
type InputLine = { menuItemId: string; qty: number };
type Item = { id: string; branchId: string; name: string; price: string; isActive: boolean; isSellable: boolean; vatRatePercent: string; productCode: string; productionStation: ProductionStation };

export function parseOrderLines(value: unknown): InputLine[] {
  return parsePolicyLines(value);
}

function tender(value: unknown) {
  if (typeof value !== "string" || !(TENDERS as readonly string[]).includes(value)) throw new HttpError(400, "Invalid tenderType");
  return value;
}

function assertOrderVisible(actor: Identity, order: { ownerOnly: boolean } | undefined) {
  if (!order || (order.ownerOnly && actor.role !== "SUPER_ADMIN")) throw new HttpError(404, "Order not found");
}

async function replay(tx: Executor, branchId: string, actor: Identity, action: Action, key: string, requestJson: unknown, orderId?: string) {
  const [attempt] = await tx.select().from(posOrderAttempts).where(and(eq(posOrderAttempts.branchId, branchId), eq(posOrderAttempts.idempotencyKey, key))).limit(1);
  if (!attempt) return null;
  // Cached responses are not authority: Owner visibility changes apply to retries too.
  const [liveOrder] = await tx.select().from(posOrders).where(eq(posOrders.id, attempt.orderId)).limit(1);
  assertOrderVisible(actor, liveOrder);
  const actorId = actor.id;
  if (attempt.actorId !== actorId) throw new HttpError(409, "idempotencyKey belongs to a different POS actor");
  if (attempt.action !== action || (orderId !== undefined && attempt.orderId !== orderId) || !sameReplayPayload(attempt.requestJson, requestJson)) throw new HttpError(409, "idempotencyKey was already used for a different POS request");
  return { ...(attempt.responseJson as Record<string, unknown>), replayed: true };
}

async function saveAttempt(tx: Executor, branchId: string, orderId: string, actorId: string, action: Action, key: string, requestJson: unknown, responseJson: unknown) {
  await tx.insert(posOrderAttempts).values({ id: randomUUID(), branchId, orderId, actorId, action, idempotencyKey: key, requestJson, responseJson });
}

async function branchSettings(tx: Executor, branchId: string) {
  const [row] = await tx.select({ id: branches.id, name: branches.name, operatingConcept: branches.operatingConcept, vatRatePercent: branches.vatRatePercent }).from(branches).where(eq(branches.id, branchId)).limit(1);
  if (!row) throw new HttpError(404, "Branch not found");
  return row;
}

async function loadItems(tx: Executor, branchId: string, lines: InputLine[]) {
  const ids = [...new Set(lines.map(line => line.menuItemId))];
  const rows = await tx.select({ id: menuItems.id, branchId: menuItems.branchId, name: menuItems.name, price: menuItems.price, isActive: menuItems.isActive, isSellable: menuItems.isSellable, vatRatePercent: menuItems.vatRatePercent, productCode: menuItems.productCode, productionStation: menuItems.productionStation }).from(menuItems).where(inArray(menuItems.id, ids));
  const byId = new Map(rows.map(row => [row.id, row as Item]));
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) throw new HttpError(400, `Menu item ${id} not found`);
    if (item.branchId !== branchId) throw new HttpError(400, `Menu item ${id} is not in this branch`);
    if (!item.isActive) throw new HttpError(400, `Menu item ${item.name} is inactive`);
    if (!item.isSellable) throw new HttpError(400, `${item.name} is a Semi-FG base and cannot be ordered directly`);
  }
  return byId;
}

function toPaise(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new HttpError(500, "Invalid persisted money value");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromPaise(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function addMoney(left: string, right: string): string {
  return fromPaise(toPaise(left) + toPaise(right));
}

function bill(lines: InputLine[], itemById: Map<string, Item>, branchVatOverride: string | null) {
  const snapshots = lines.map(line => {
    const item = itemById.get(line.menuItemId)!;
    return { ...line, item, vatRatePercent: branchVatOverride ?? item.vatRatePercent, lineTotal: fromPaise(toPaise(item.price) * BigInt(line.qty)) };
  });
  const vat = vatInvoiceSummary(snapshots.map(line => ({ taxableAmountDecimal: line.lineTotal, ratePercent: line.vatRatePercent })));
  return { snapshots, subtotal: vat.grandTaxable, taxAmount: vat.grandTotalTax, totalAmount: vat.grandTotal, vat };
}

async function currency(tx: Executor, codeValue: unknown, totalAmount: string) {
  if (codeValue !== undefined && (typeof codeValue !== "string" || !/^[A-Za-z]{3}$/.test(codeValue.trim()))) throw new HttpError(400, "Invalid tenderCurrencyCode");
  const tenderCurrencyCode = typeof codeValue === "string" ? codeValue.trim().toUpperCase() : "INR";
  let fxRateToInr = 1;
  if (tenderCurrencyCode !== "INR") {
    const [row] = await tx.select({ rateToInr: currencyRates.rateToInr }).from(currencyRates).where(eq(currencyRates.currencyCode, tenderCurrencyCode)).limit(1);
    if (!row) throw new HttpError(400, `No exchange rate configured for ${tenderCurrencyCode} — ask the Owner to set one first.`);
    fxRateToInr = Number(row.rateToInr);
  }
  return { tenderCurrencyCode, fxRateToInr: fxRateToInr.toFixed(6), tenderCurrencyAmount: tenderCurrencyCode === "INR" ? totalAmount : (Number(totalAmount) / fxRateToInr).toFixed(2) };
}

async function insertLinesAndTickets(tx: Executor, orderId: string, branchId: string, lines: InputLine[], itemById: Map<string, Item>, vatOverride: string | null) {
  const rows = lines.map(line => {
    const item = itemById.get(line.menuItemId)!;
    return { id: randomUUID(), orderId, menuItemId: line.menuItemId, nameSnapshot: item.name, productCodeSnapshot: item.productCode, qty: line.qty, price: item.price, vatRatePercent: vatOverride ?? item.vatRatePercent };
  });
  await tx.insert(posOrderLines).values(rows);
  const plans = productionTickets(rows.map(row => ({ orderLineId: row.id, menuItemId: row.menuItemId, name: itemById.get(row.menuItemId)!.name, qty: row.qty, productionStation: itemById.get(row.menuItemId)!.productionStation })));
  const tickets = [];
  for (const plan of plans) {
    const ticketId = randomUUID();
    const ticketNumber = `${plan.ticketType}-${Date.now()}-${ticketId.slice(0, 4)}`;
    await tx.insert(posProductionTickets).values({ id: ticketId, orderId, branchId, station: plan.station, ticketNumber, status: "SENT", revision: 1, snapshotLines: plan.lines.map(line => ({ orderLineId: line.orderLineId, menuItemId: line.menuItemId, name: line.name, qty: line.qty })) });
    await tx.insert(posProductionTicketLines).values(plan.lines.map(line => ({ id: randomUUID(), ticketId, orderLineId: line.orderLineId })));
    tickets.push({ id: ticketId, ticketNumber, station: plan.station, ticketType: plan.ticketType, lines: plan.lines.map(({ orderLineId: _orderLineId, ...line }) => line) });
  }
  return tickets;
}

function receipt(lines: { menuItemId: string; name: string; qty: number; price: string; vatRatePercent: string; productCode: string }[], subtotal: string, taxAmount: string, totalAmount: string, tenderCurrencyCode: string, fxRateToInr: string, tenderCurrencyAmount: string) {
  const receiptLines = lines.map(line => ({ ...line, lineTotal: fromPaise(toPaise(line.price) * BigInt(line.qty)) }));
  const vat = vatInvoiceSummary(receiptLines.map(line => ({ taxableAmountDecimal: line.lineTotal, ratePercent: line.vatRatePercent })));
  return { lines: receiptLines, subtotal, taxAmount, totalAmount, vat, currency: tenderCurrencyCode === "INR" ? null : { tenderCurrencyCode, fxRateToInr, tenderCurrencyAmount } };
}

export async function createPosOrder(tx: Executor, actor: Identity, branchId: string, input: Record<string, unknown>, documentContext?: { draftId: string; draftRevision: number }) {
  assertModule(actor, "POS_CASHIER");
  branchScope(actor, branchId);
  assertAllowedFields(input, ["branchId", "channel", "tableNo", "counterNo", "customerPhone", "customerName", "tenderType", "tenderCurrencyCode", "lines", "idempotencyKey"]);
  const key = idempotencyKey(input.idempotencyKey);
  const previous = await replay(tx, branchId, actor, "CREATE", key, input); if (previous) return previous;
  const branch = await branchSettings(tx, branchId);
  const channel = input.channel as OrderChannel;
  if (!(["DINE_IN", "TAKEAWAY", "SWIGGY", "ZOMATO"] as string[]).includes(channel)) throw new HttpError(400, "Invalid channel");
  const flow = orderFlow(branch.operatingConcept as BranchConcept, channel);
  const tableNo = tableNumber(input.tableNo, flow);
  if (input.counterNo !== undefined && (typeof input.counterNo !== "string" || !(POS_COUNTERS as readonly string[]).includes(input.counterNo))) throw new HttpError(400, "Invalid counterNo");
  const counterNo = typeof input.counterNo === "string" ? input.counterNo : "COUNTER_1";
  if (input.customerName !== undefined && (typeof input.customerName !== "string" || input.customerName.length > 80)) throw new HttpError(400, "Invalid customerName");
  const customerName = typeof input.customerName === "string" ? input.customerName.trim() : "";
  const customerPhone = validOptionalPhone(input.customerPhone);
  const lines = parseOrderLines(input.lines);
  const itemById = await loadItems(tx, branchId, lines);
  const { shiftRunId } = await requireOperableShift(tx, branchId);
  const billing = bill(lines, itemById, branch.vatRatePercent);
  const payment = flow === "PAYMENT_FIRST" ? await currency(tx, input.tenderCurrencyCode, billing.totalAmount) : { tenderCurrencyCode: "INR", fxRateToInr: "1.000000", tenderCurrencyAmount: "0.00" };
  const tenderType = flow === "PAYMENT_FIRST" ? tender(input.tenderType) : "";
  const orderId = randomUUID();
  await lockRecipeStock(tx, branchId);
  const recipeRows = await readStockRecipe(tx, branchId, [...itemById.keys()]);
  const required = directRequirements(branchId, recipeRows, lines.map(line => ({ menuItemId: line.menuItemId, quantity: String(line.qty) })));
  const deductions = await deductStock(tx, branchId, required, { type: "POS_ORDER", id: orderId, actorId: actor.id });
  // Cost belongs to this dispatch, including an unpaid conventional table.
  const cogs = await computeOrderCogs(tx, branchId, lines);
  const now = new Date();
  const orderNumber = `ORD-${Date.now()}-${orderId.slice(0, 4)}`;
  const pickupToken = await allocatePickupToken(tx, branchId, channel, now);
  await tx.insert(posOrders).values({ id: orderId, branchId, orderNumber, channel, operatingConcept: branch.operatingConcept, tableNo, counterNo, customerPhone, customerName, serviceStatus: "ACTIVE", revision: 1, subtotal: billing.subtotal, taxAmount: billing.taxAmount, totalAmount: billing.totalAmount, tenderCurrencyCode: payment.tenderCurrencyCode, fxRateToInr: payment.fxRateToInr, tenderCurrencyAmount: payment.tenderCurrencyAmount, tenderType, status: flow === "PRODUCTION_FIRST" ? "OPEN" : "PAID", cashierId: actor.id, shiftRunId, cogsAmount: cogs.cogsAmount, cogsComplete: cogs.complete, stockDeductedAt: now, settledAt: flow === "PAYMENT_FIRST" ? now : null, pickupToken });
  const tickets = await insertLinesAndTickets(tx, orderId, branchId, lines, itemById, branch.vatRatePercent);
  let receiptResult = null;
  if (flow === "PAYMENT_FIRST") {
    const receiptNumber = `RCP-${Date.now()}-${orderId.slice(0, 4)}`;
    await tx.insert(posReceipts).values({ id: randomUUID(), orderId, branchId, receiptNumber });
    receiptResult = { receiptNumber, pickupToken, ...receipt(billing.snapshots.map(line => ({ menuItemId: line.menuItemId, name: line.item.name, qty: line.qty, price: line.item.price, vatRatePercent: line.vatRatePercent, productCode: line.item.productCode })), billing.subtotal, billing.taxAmount, billing.totalAmount, payment.tenderCurrencyCode, payment.fxRateToInr, payment.tenderCurrencyAmount) };
  }
  const final = flow === "PAYMENT_FIRST" ? await issueFinalPosDocument(tx, actor, orderId, documentContext) : null;
  const collection = flow === "PAYMENT_FIRST" ? await capturePosPayment(tx, actor, orderId, "CREATE") : {};
  const result = { order: { id: orderId, orderNumber, pickupToken, branchId, branchName: branch.name, channel, tableNo, status: flow === "PRODUCTION_FIRST" ? "OPEN" : "PAID", flow, customerPhone, customerName }, tickets: tickets.map(ticket => ({ ...ticket, pickupToken })), kot: tickets.flatMap(ticket => ticket.lines), receipt: receiptResult, ...(final ? { finalDocument: final.document, ...(final.unavailableReason ? { documentUnavailableReason: final.unavailableReason } : {}) } : {}), inventoryDeducted: deductions.inventoryDeducted.map(row => ({ ...row, qtyDeducted: Number(row.qtyDeducted) })), semiFgDeducted: deductions.semiFgDeducted.map(row => ({ ...row, qtyDeducted: Number(row.qtyDeducted) })) };
  Object.assign(result, collection);
  await saveAttempt(tx, branchId, orderId, actor.id, "CREATE", key, input, result);
  return result;
}

export async function addPosOrderLines(tx: Executor, actor: Identity, orderId: string, input: Record<string, unknown>) {
  assertModule(actor, "POS_CASHIER");
  assertAllowedFields(input, ["lines", "idempotencyKey"]);
  const [order] = await tx.select().from(posOrders).where(eq(posOrders.id, orderId)).limit(1);
  assertOrderVisible(actor, order);
  branchScope(actor, order.branchId);
  const key = idempotencyKey(input.idempotencyKey);
  const previous = await replay(tx, order.branchId, actor, "ADD_LINES", key, input, orderId); if (previous) return previous;
  if (["CLOSED", "CANCELLED"].includes(order.serviceStatus)) throw new HttpError(409, "Order service is closed or cancelled");
  const branch = await branchSettings(tx, order.branchId);
  if (order.operatingConcept !== "CONVENTIONAL" || order.channel !== "DINE_IN" || order.status !== "OPEN") throw new HttpError(409, "Only an OPEN conventional dine-in order can accept more lines");
  await requireOperableShift(tx, order.branchId);
  const lines = parseOrderLines(input.lines);
  const itemById = await loadItems(tx, order.branchId, lines);
  const billing = bill(lines, itemById, branch.vatRatePercent);
  await lockRecipeStock(tx, order.branchId);
  const recipeRows = await readStockRecipe(tx, order.branchId, [...itemById.keys()]);
  const required = directRequirements(order.branchId, recipeRows, lines.map(line => ({ menuItemId: line.menuItemId, quantity: String(line.qty) })));
  const deductions = await deductStock(tx, order.branchId, required, { type: "POS_ORDER", id: orderId, eventId: `${orderId}:ADD_LINES:${key}`, actorId: actor.id });
  const cogs = await computeOrderCogs(tx, order.branchId, lines);
  const tickets = await insertLinesAndTickets(tx, orderId, order.branchId, lines, itemById, branch.vatRatePercent);
  const subtotal = addMoney(order.subtotal, billing.subtotal);
  const taxAmount = addMoney(order.taxAmount, billing.taxAmount);
  const totalAmount = addMoney(order.totalAmount, billing.totalAmount);
  await tx.update(posOrders).set({ revision: (order.revision ?? 1) + 1, subtotal, taxAmount, totalAmount, cogsAmount: addMoney(order.cogsAmount, cogs.cogsAmount), cogsComplete: order.cogsComplete && cogs.complete }).where(eq(posOrders.id, orderId));
  const result = { order: { id: orderId, orderNumber: order.orderNumber, status: "OPEN", subtotal, taxAmount, totalAmount }, tickets, inventoryDeducted: deductions.inventoryDeducted.map(row => ({ ...row, qtyDeducted: Number(row.qtyDeducted) })), semiFgDeducted: deductions.semiFgDeducted.map(row => ({ ...row, qtyDeducted: Number(row.qtyDeducted) })) };
  await saveAttempt(tx, order.branchId, orderId, actor.id, "ADD_LINES", key, input, result);
  return result;
}

export async function settlePosOrder(tx: Executor, actor: Identity, orderId: string, input: Record<string, unknown>) {
  assertModule(actor, "POS_CASHIER");
  assertAllowedFields(input, ["tenderType", "tenderCurrencyCode", "idempotencyKey"]);
  const [order] = await tx.select().from(posOrders).where(eq(posOrders.id, orderId)).limit(1);
  assertOrderVisible(actor, order);
  branchScope(actor, order.branchId);
  const key = idempotencyKey(input.idempotencyKey);
  const previous = await replay(tx, order.branchId, actor, "SETTLE", key, input, orderId); if (previous) return previous;
  if (["CLOSED", "CANCELLED"].includes(order.serviceStatus)) throw new HttpError(409, "Order service is closed or cancelled");
  const branch = await branchSettings(tx, order.branchId);
  if (order.operatingConcept !== "CONVENTIONAL" || order.channel !== "DINE_IN" || order.status !== "OPEN") throw new HttpError(409, "Only an OPEN conventional dine-in order can be settled");
  if (!order.stockDeductedAt) throw new HttpError(409, "Order stock has not been posted; do not settle until the kitchen posting is verified");
  const { shiftRunId } = await requireOperableShift(tx, order.branchId);
  const tenderType = tender(input.tenderType);
  const payment = await currency(tx, input.tenderCurrencyCode, order.totalAmount);
  const savedLines = await tx.select({ id: posOrderLines.id, menuItemId: posOrderLines.menuItemId, qty: posOrderLines.qty, price: posOrderLines.price, vatRatePercent: posOrderLines.vatRatePercent, nameSnapshot: posOrderLines.nameSnapshot, productCodeSnapshot: posOrderLines.productCodeSnapshot, name: menuItems.name, productCode: menuItems.productCode }).from(posOrderLines).innerJoin(menuItems, eq(menuItems.id, posOrderLines.menuItemId)).where(eq(posOrderLines.orderId, orderId));
  if (!savedLines.length) throw new HttpError(409, "Open order has no lines");
  // Collection changes the shift attribution, never the dispatch-time stock/COGS.
  const now = new Date();
  const receiptNumber = `RCP-${Date.now()}-${orderId.slice(0, 4)}`;
  await tx.insert(posReceipts).values({ id: randomUUID(), orderId, branchId: order.branchId, receiptNumber });
  await tx.update(posOrders).set({ revision: (order.revision ?? 1) + 1, tenderType, tenderCurrencyCode: payment.tenderCurrencyCode, fxRateToInr: payment.fxRateToInr, tenderCurrencyAmount: payment.tenderCurrencyAmount, status: "PAID", settledAt: now, shiftRunId }).where(eq(posOrders.id, orderId));
  const receiptLines = savedLines.map(({ nameSnapshot, productCodeSnapshot, ...line }) => ({ ...line, name: nameSnapshot ?? line.name, productCode: productCodeSnapshot ?? line.productCode, vatRatePercent: line.vatRatePercent ?? branch.vatRatePercent ?? "18.00" }));
  const receiptResult = { receiptNumber, ...receipt(receiptLines, order.subtotal, order.taxAmount, order.totalAmount, payment.tenderCurrencyCode, payment.fxRateToInr, payment.tenderCurrencyAmount) };
  const final = await issueFinalPosDocument(tx, actor, orderId);
  const collection = await capturePosPayment(tx, actor, orderId, "SETTLE");
  const result = { order: { id: orderId, orderNumber: order.orderNumber, status: "PAID", tenderType }, receipt: receiptResult, finalDocument: final.document, ...(final.unavailableReason ? { documentUnavailableReason: final.unavailableReason } : {}), inventoryDeducted: [], semiFgDeducted: [] };
  Object.assign(result, collection);
  await saveAttempt(tx, order.branchId, orderId, actor.id, "SETTLE", key, input, result);
  return result;
}
