import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { menuItems } from "../../db/schema/menu";
import { branches } from "../../db/schema/platform";
import { posOrders, posOrderAttempts, posProductionTickets } from "../../db/schema/pos";
import { posDrafts, posLifecycleActions, posLifecycleEvents } from "../../db/schema/pos-lifecycle";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { assertAllowedFields, orderFlow, parsePolicyLines, sameReplayPayload, tableNumber } from "./pos-order-policy";
import { lifecycleCapabilities, revisionGuard, ticketTransition } from "./pos-lifecycle-policy";
import { createPosOrder } from "./pos-orders";
import { validOptionalPhone } from "./whatsapp-triggers";

type Draft = typeof posDrafts.$inferSelect;
type TargetType = "DRAFT" | "ORDER" | "TICKET";
const dateString = (value: Date) => value.toISOString();
function requestKey(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw new HttpError(400, "requestKey must contain 1-128 characters");
  return value;
}
function draftDTO(row: Draft) {
  return { id: row.id, branchId: row.branchId, status: row.status, revision: row.revision, payload: row.payload, orderId: row.orderId, createdAt: dateString(row.createdAt), updatedAt: dateString(row.updatedAt) };
}
async function oneDraft(tx: Executor, actor: Identity, id: string) {
  assertModule(actor, "POS_CASHIER");
  const [row] = await tx.select().from(posDrafts).where(eq(posDrafts.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Draft not found");
  branchScope(actor, row.branchId);
  if (row.orderId) await visibleOrder(tx, actor, row.orderId);
  return row;
}
async function visibleOrder(tx: Executor, actor: Identity, id: string) {
  const [row] = await tx.select().from(posOrders).where(eq(posOrders.id, id)).limit(1);
  if (!row || (row.ownerOnly && actor.role !== "SUPER_ADMIN")) throw new HttpError(404, "Order not found");
  branchScope(actor, row.branchId);
  return row;
}
async function previousAction(tx: Executor, actor: Identity, branchId: string, type: TargetType, targetId: string | null, action: string, input: Record<string, unknown>) {
  const key = requestKey(input.requestKey);
  const [saved] = await tx.select().from(posLifecycleActions).where(and(eq(posLifecycleActions.branchId, branchId), eq(posLifecycleActions.requestKey, key))).limit(1);
  if (!saved) return null;
  // Even CREATE replay must authorize the original live target, not cached JSON.
  if (saved.targetType === "DRAFT") await oneDraft(tx, actor, saved.targetId);
  else if (saved.targetType === "ORDER") await visibleOrder(tx, actor, saved.targetId);
  else if (saved.targetType === "TICKET") await oneTicket(tx, actor, saved.targetId);
  if (saved.actorId !== actor.id || saved.targetType !== type || (targetId !== null && targetId !== saved.targetId) || saved.action !== action || !sameReplayPayload(saved.requestJson, input)) throw new HttpError(409, "requestKey was used for a different lifecycle request");
  return { ...(saved.responseJson as Record<string, unknown>), replayed: true };
}
async function saveAction(tx: Executor, actor: Identity, branchId: string, targetType: TargetType, targetId: string, action: string, input: Record<string, unknown>, responseJson: unknown) {
  await tx.insert(posLifecycleActions).values({ id: randomUUID(), branchId, targetType, targetId, action, actorId: actor.id, requestKey: requestKey(input.requestKey), requestJson: input, responseJson });
}
async function event(tx: Executor, actor: Identity, branchId: string, targetType: TargetType, targetId: string, action: string, revision: number, fromStatus: string | null, toStatus: string, reason: string | null = null) {
  await tx.insert(posLifecycleEvents).values({ id: randomUUID(), branchId, targetType, targetId, action, actorId: actor.id, revision, fromStatus, toStatus, reason });
}
async function draftPayload(tx: Executor, branchId: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid draft payload");
  const input = value as Record<string, unknown>;
  assertAllowedFields(input, ["channel", "tableNo", "counterNo", "customerPhone", "customerName", "tenderType", "tenderCurrencyCode", "lines"]);
  if (typeof input.channel !== "string" || !["DINE_IN", "TAKEAWAY", "SWIGGY", "ZOMATO"].includes(input.channel)) throw new HttpError(400, "Invalid channel");
  const [branch] = await tx.select().from(branches).where(eq(branches.id, branchId)).limit(1);
  if (!branch) throw new HttpError(404, "Branch not found");
  tableNumber(input.tableNo, orderFlow(branch.operatingConcept, input.channel as "DINE_IN" | "TAKEAWAY" | "SWIGGY" | "ZOMATO"));
  if (input.counterNo !== undefined && (typeof input.counterNo !== "string" || !["COUNTER_1", "COUNTER_2"].includes(input.counterNo))) throw new HttpError(400, "Invalid counterNo");
  if (input.customerName !== undefined && (typeof input.customerName !== "string" || input.customerName.length > 80)) throw new HttpError(400, "Invalid customerName");
  validOptionalPhone(input.customerPhone);
  if (input.tenderType !== undefined && (typeof input.tenderType !== "string" || !["CASH", "UPI", "CARD", "SWIGGY", "ZOMATO"].includes(input.tenderType))) throw new HttpError(400, "Invalid tenderType");
  if (input.tenderCurrencyCode !== undefined && (typeof input.tenderCurrencyCode !== "string" || !/^[A-Za-z]{3}$/.test(input.tenderCurrencyCode.trim()))) throw new HttpError(400, "Invalid tenderCurrencyCode");
  const lines = parsePolicyLines(input.lines);
  const ids = [...new Set(lines.map(line => line.menuItemId))];
  const items = await tx.select().from(menuItems).where(inArray(menuItems.id, ids));
  for (const id of ids) {
    const item = items.find(row => row.id === id);
    if (!item || item.branchId !== branchId || !item.isActive || !item.isSellable) throw new HttpError(400, "Draft requires current sellable same-branch items");
  }
  return { ...input, lines };
}
function editable(row: Draft, expected: unknown) {
  revisionGuard(row.revision, expected);
  if (row.status !== "DRAFT") throw new HttpError(409, "Only a DRAFT can be edited, dispatched or cancelled");
}
async function changeDraft(tx: Executor, row: Draft, values: Partial<Draft>) {
  const [updated] = await tx.update(posDrafts).set({ ...values, revision: row.revision + 1, updatedAt: new Date() }).where(and(eq(posDrafts.id, row.id), eq(posDrafts.revision, row.revision), eq(posDrafts.status, "DRAFT"))).returning();
  if (!updated) throw new HttpError(409, "Draft changed concurrently");
  return updated;
}
export async function createPosDraft(tx: Executor, actor: Identity, branchId: string, input: Record<string, unknown>) {
  assertModule(actor, "POS_CASHIER"); branchScope(actor, branchId);
  if (!branchId) throw new HttpError(400, "branchId is required");
  assertAllowedFields(input, ["branchId", "payload", "requestKey"]);
  const replay = await previousAction(tx, actor, branchId, "DRAFT", null, "CREATE_DRAFT", input); if (replay) return replay;
  const payload = await draftPayload(tx, branchId, input.payload);
  const row: Draft = { id: randomUUID(), branchId, payload, status: "DRAFT", revision: 1, orderId: null, createdBy: actor.id, createdAt: new Date(), updatedAt: new Date() };
  await tx.insert(posDrafts).values(row);
  await event(tx, actor, branchId, "DRAFT", row.id, "CREATE_DRAFT", 1, null, "DRAFT");
  const result = { draft: draftDTO(row) };
  await saveAction(tx, actor, branchId, "DRAFT", row.id, "CREATE_DRAFT", input, result);
  return result;
}
export async function editPosDraft(tx: Executor, actor: Identity, id: string, input: Record<string, unknown>) {
  const row = await oneDraft(tx, actor, id);
  assertAllowedFields(input, ["payload", "expectedRevision", "requestKey"]);
  const replay = await previousAction(tx, actor, row.branchId, "DRAFT", id, "EDIT_DRAFT", input); if (replay) return replay;
  editable(row, input.expectedRevision);
  const payload = await draftPayload(tx, row.branchId, input.payload);
  const updated = await changeDraft(tx, row, { payload });
  await event(tx, actor, row.branchId, "DRAFT", id, "EDIT_DRAFT", updated.revision, "DRAFT", "DRAFT");
  const result = { draft: draftDTO(updated) };
  await saveAction(tx, actor, row.branchId, "DRAFT", id, "EDIT_DRAFT", input, result);
  return result;
}

export async function dispatchPosDraft(tx: Executor, actor: Identity, id: string, input: Record<string, unknown>) {
  const row = await oneDraft(tx, actor, id);
  assertAllowedFields(input, ["expectedRevision", "requestKey"]);
  const replay = await previousAction(tx, actor, row.branchId, "DRAFT", id, "DISPATCH_DRAFT", input); if (replay) return replay;
  editable(row, input.expectedRevision);
  const payload = await draftPayload(tx, row.branchId, row.payload);
  // Namespace is per persisted draft, never reuse the caller's key in GAP-023.
  const admitted = await createPosOrder(tx, actor, row.branchId, { ...payload, idempotencyKey: `draft:${id}` }, { draftId: id, draftRevision: row.revision });
  const orderId = (admitted as { order: { id: string } }).order.id;
  const updated = await changeDraft(tx, row, { status: "DISPATCHED", orderId });
  await event(tx, actor, row.branchId, "DRAFT", id, "DISPATCH_DRAFT", updated.revision, "DRAFT", "DISPATCHED");
  const result = { draft: draftDTO(updated), ...admitted };
  await saveAction(tx, actor, row.branchId, "DRAFT", id, "DISPATCH_DRAFT", input, result);
  return result;
}
function cancellationReason(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 500) throw new HttpError(400, "A cancellation reason (1-500 characters) is required");
  return value.trim();
}
export async function cancelPosDraft(tx: Executor, actor: Identity, id: string, input: Record<string, unknown>) {
  const row = await oneDraft(tx, actor, id);
  assertAllowedFields(input, ["expectedRevision", "requestKey", "reason"]);
  const replay = await previousAction(tx, actor, row.branchId, "DRAFT", id, "CANCEL_DRAFT", input); if (replay) return replay;
  editable(row, input.expectedRevision);
  const reason = cancellationReason(input.reason);
  const updated = await changeDraft(tx, row, { status: "CANCELLED" });
  await event(tx, actor, row.branchId, "DRAFT", id, "CANCEL_DRAFT", updated.revision, "DRAFT", "CANCELLED", reason);
  const result = { draft: draftDTO(updated) };
  await saveAction(tx, actor, row.branchId, "DRAFT", id, "CANCEL_DRAFT", input, result);
  return result;
}

type TicketRow = typeof posProductionTickets.$inferSelect;
function assertTicketAccess(actor: Identity) {
  const caps = lifecycleCapabilities(actor);
  if (!caps.canCashier && !caps.canPrepare) throw new HttpError(403, "Kitchen or cashier access required");
  return caps;
}
async function oneTicket(tx: Executor, actor: Identity, id: string) {
  assertTicketAccess(actor);
  const [row] = await tx.select().from(posProductionTickets).where(eq(posProductionTickets.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Ticket not found");
  branchScope(actor, row.branchId);
  const order = await visibleOrder(tx, actor, row.orderId);
  if (order.branchId !== row.branchId) throw new HttpError(404, "Ticket not found");
  return { row, order };
}
function safeEvent(row: typeof posLifecycleEvents.$inferSelect) {
  return { id: row.id, action: row.action, actorId: row.actorId, createdAt: dateString(row.createdAt), revision: row.revision, ...(row.reason ? { reason: row.reason } : {}), ...(row.fromStatus ? { fromStatus: row.fromStatus } : {}), ...(row.toStatus ? { toStatus: row.toStatus } : {}) };
}
async function ticketDTO(tx: Executor, actor: Identity, row: TicketRow, order: typeof posOrders.$inferSelect) {
  const events = await tx.select().from(posLifecycleEvents).where(and(eq(posLifecycleEvents.targetType, "TICKET"), eq(posLifecycleEvents.targetId, row.id))).orderBy(asc(posLifecycleEvents.revision));
  const attempts = await tx.select().from(posOrderAttempts).where(eq(posOrderAttempts.orderId, row.orderId)).orderBy(asc(posOrderAttempts.createdAt));
  // The GAP-023 successful admission record is itself an append-only dispatch event.
  const admission = attempts.find(attempt => {
    const response = attempt.responseJson as { tickets?: { id: string }[] };
    return Array.isArray(response.tickets) && response.tickets.some(ticket => ticket.id === row.id);
  });
  const history = events.map(safeEvent);
  if (admission) history.unshift({ id: admission.id, action: "SENT", actorId: admission.actorId, createdAt: dateString(admission.createdAt), revision: 1, toStatus: "SENT" });
  type SavedLine = { orderLineId?: string; menuItemId: string; name: string; qty: number };
  const snapshotAvailable = Array.isArray(row.snapshotLines) && row.snapshotLines.length > 0 && row.snapshotLines.every(line => line && typeof line === "object" && typeof line.menuItemId === "string" && typeof line.name === "string" && Number.isInteger(line.qty) && line.qty > 0);
  const lines: SavedLine[] = snapshotAvailable ? (row.snapshotLines as SavedLine[]).map(line => ({ ...(typeof line.orderLineId === "string" ? { orderLineId: line.orderLineId } : {}), menuItemId: line.menuItemId, name: line.name, qty: line.qty })) : [];
  const caps = lifecycleCapabilities(actor);
  const allowedActions: ("START" | "READY" | "SERVE")[] = [];
  if (!["CLOSED", "CANCELLED"].includes(order.serviceStatus)) {
    if (caps.canPrepare && row.status === "SENT") allowedActions.push("START");
    if (caps.canPrepare && row.status === "PREPARING") allowedActions.push("READY");
    if (caps.canCashier && row.status === "READY") allowedActions.push("SERVE");
  }
  return { id: row.id, orderId: row.orderId, branchId: row.branchId, orderNumber: order.orderNumber, tableNo: order.tableNo, station: row.station, ticketNumber: row.ticketNumber, status: row.status, revision: row.revision, createdAt: dateString(row.createdAt), lines, snapshotAvailable, history, allowedActions };
}
export async function readPosTicket(tx: Executor, actor: Identity, id: string) {
  const { row, order } = await oneTicket(tx, actor, id);
  return { ticket: await ticketDTO(tx, actor, row, order) };
}
export async function actPosTicket(tx: Executor, actor: Identity, id: string, input: Record<string, unknown>) {
  const { row, order } = await oneTicket(tx, actor, id);
  assertAllowedFields(input, ["action", "expectedRevision", "requestKey"]);
  const caps = lifecycleCapabilities(actor);
  if (typeof input.action !== "string" || !["START", "READY", "SERVE"].includes(input.action)) throw new HttpError(400, "Invalid ticket action");
  if (input.action === "SERVE" ? !caps.canCashier : !caps.canPrepare) throw new HttpError(403, "Ticket action permission required");
  const action = String(input.action);
  const replay = await previousAction(tx, actor, row.branchId, "TICKET", id, action, input); if (replay) return replay;
  if (["CLOSED", "CANCELLED"].includes(order.serviceStatus) || order.status === "VOIDED") throw new HttpError(409, "Order no longer accepts ticket actions");
  const status = ticketTransition(actor, row.status, action, row.revision, input.expectedRevision);
  const [updated] = await tx.update(posProductionTickets).set({ status, revision: row.revision + 1 }).where(and(eq(posProductionTickets.id, id), eq(posProductionTickets.revision, row.revision), eq(posProductionTickets.status, row.status))).returning();
  if (!updated) throw new HttpError(409, "Ticket changed concurrently");
  await event(tx, actor, row.branchId, "TICKET", id, action, updated.revision, row.status, status);
  const result = { ticket: await ticketDTO(tx, actor, updated, order) };
  await saveAction(tx, actor, row.branchId, "TICKET", id, action, input, result);
  return result;
}

async function orderDTO(tx: Executor, actor: Identity, row: typeof posOrders.$inferSelect) {
  const ticketRows = await tx.select().from(posProductionTickets).where(eq(posProductionTickets.orderId, row.id)).orderBy(asc(posProductionTickets.createdAt), asc(posProductionTickets.id));
  const events = await tx.select().from(posLifecycleEvents).where(and(eq(posLifecycleEvents.targetType, "ORDER"), eq(posLifecycleEvents.targetId, row.id))).orderBy(asc(posLifecycleEvents.revision));
  const attempts = await tx.select().from(posOrderAttempts).where(eq(posOrderAttempts.orderId, row.id)).orderBy(asc(posOrderAttempts.createdAt), asc(posOrderAttempts.id));
  const history = [...attempts.map((attempt, index) => ({ id: attempt.id, action: attempt.action, actorId: attempt.actorId, createdAt: dateString(attempt.createdAt), revision: index + 1 })), ...events.map(safeEvent)];
  return { id: row.id, branchId: row.branchId, orderNumber: row.orderNumber, tableNo: row.tableNo, channel: row.channel, operatingConcept: row.operatingConcept, status: row.status, totalAmount: row.totalAmount, serviceStatus: row.serviceStatus, revision: row.revision, closedAt: row.closedAt ? dateString(row.closedAt) : null, tickets: await Promise.all(ticketRows.map(ticket => ticketDTO(tx, actor, ticket, row))), history };
}
export async function actPosOrder(tx: Executor, actor: Identity, id: string, input: Record<string, unknown>) {
  assertModule(actor, "POS_CASHIER");
  const row = await visibleOrder(tx, actor, id);
  assertAllowedFields(input, ["action", "expectedRevision", "requestKey", "reason"]);
  if (input.action !== "CLOSE" && input.action !== "CANCEL") throw new HttpError(400, "Invalid order lifecycle action");
  const action = input.action;
  if (action === "CANCEL" && !lifecycleCapabilities(actor).canCancel) throw new HttpError(403, "Manager cancellation permission required");
  const replay = await previousAction(tx, actor, row.branchId, "ORDER", id, action, input); if (replay) return replay;
  revisionGuard(row.revision, input.expectedRevision);
  if (row.serviceStatus !== "ACTIVE") throw new HttpError(409, "Only an ACTIVE order accepts lifecycle actions");
  const tickets = await tx.select().from(posProductionTickets).where(eq(posProductionTickets.orderId, id));
  let reason: string | null = null;
  if (action === "CLOSE") {
    if (row.status !== "PAID") throw new HttpError(409, "Full payment is required before service close");
    if (!tickets.length || tickets.some(ticket => ticket.status !== "SERVED" && ticket.status !== "CANCELLED")) throw new HttpError(409, "Every noncancelled ticket must be served before close");
  } else {
    if (row.status !== "OPEN") throw new HttpError(409, "Paid orders cannot be cancelled here; use GAP-027 void/refund");
    reason = cancellationReason(input.reason);
  }
  const serviceStatus = action === "CLOSE" ? "CLOSED" : "CANCELLED";
  const [updated] = await tx.update(posOrders).set({ serviceStatus, revision: row.revision + 1, ...(action === "CLOSE" ? { closedAt: new Date() } : { status: "VOIDED" as const, voidReason: reason!, voidedAt: new Date() }) }).where(and(eq(posOrders.id, id), eq(posOrders.revision, row.revision), eq(posOrders.serviceStatus, "ACTIVE"), eq(posOrders.status, row.status))).returning();
  if (!updated) throw new HttpError(409, "Order changed concurrently");
  if (action === "CANCEL") {
    for (const ticket of tickets.filter(ticket => ticket.status !== "CANCELLED")) {
      const [cancelled] = await tx.update(posProductionTickets).set({ status: "CANCELLED", revision: ticket.revision + 1 }).where(and(eq(posProductionTickets.id, ticket.id), eq(posProductionTickets.revision, ticket.revision))).returning();
      if (!cancelled) throw new HttpError(409, "Ticket changed concurrently");
      await event(tx, actor, row.branchId, "TICKET", ticket.id, "CANCEL", cancelled.revision, ticket.status, "CANCELLED", reason);
    }
  }
  await event(tx, actor, row.branchId, "ORDER", id, action, updated.revision, row.serviceStatus, serviceStatus, reason);
  const result = { order: await orderDTO(tx, actor, updated) };
  await saveAction(tx, actor, row.branchId, "ORDER", id, action, input, result);
  return result;
}

export const POS_LIFECYCLE_LIMIT = 200;
type ListOptions = { branchId?: unknown; includeClosed?: unknown; includeServed?: unknown; station?: unknown };
function listScope(actor: Identity, value: unknown) {
  if (value !== undefined && (typeof value !== "string" || !value.trim() || value.length > 200)) throw new HttpError(400, "Invalid branchId");
  return branchScope(actor, value as string | undefined);
}
function includeFlag(value: unknown) {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new HttpError(400, "Invalid include flag; use true or false");
}
export async function listPosLifecycle(tx: Executor, actor: Identity, options: ListOptions = {}) {
  assertModule(actor, "POS_CASHIER");
  const scope = listScope(actor, options.branchId);
  const includeClosed = includeFlag(options.includeClosed);
  const visibility = and(scope ? eq(posOrders.branchId, scope) : undefined, actor.role === "SUPER_ADMIN" ? undefined : eq(posOrders.ownerOnly, false));
  // Authorize linked draft orders BEFORE applying the disclosed draft bound.
  const visibleIds = (await tx.select({ id: posOrders.id }).from(posOrders).where(visibility)).map(row => row.id);
  const drafts = await tx.select().from(posDrafts).where(and(scope ? eq(posDrafts.branchId, scope) : undefined, includeClosed ? undefined : eq(posDrafts.status, "DRAFT"), or(isNull(posDrafts.orderId), inArray(posDrafts.orderId, visibleIds)))).orderBy(asc(posDrafts.createdAt), asc(posDrafts.id)).limit(POS_LIFECYCLE_LIMIT + 1);
  const orders = await tx.select().from(posOrders).where(and(visibility, includeClosed ? undefined : or(eq(posOrders.serviceStatus, "ACTIVE"), and(eq(posOrders.serviceStatus, "LEGACY"), inArray(posOrders.status, ["OPEN", "PAID"]))))).orderBy(asc(posOrders.createdAt), asc(posOrders.id)).limit(POS_LIFECYCLE_LIMIT + 1);
  return { drafts: drafts.slice(0, POS_LIFECYCLE_LIMIT).map(draftDTO), orders: await Promise.all(orders.slice(0, POS_LIFECYCLE_LIMIT).map(row => orderDTO(tx, actor, row))), visibilityScope: actor.role === "SUPER_ADMIN" ? "actual" as const : "access-filtered" as const, limit: POS_LIFECYCLE_LIMIT, truncated: drafts.length > POS_LIFECYCLE_LIMIT || orders.length > POS_LIFECYCLE_LIMIT, capabilities: lifecycleCapabilities(actor) };
}
export async function listPosKitchen(tx: Executor, actor: Identity, options: ListOptions = {}) {
  const capabilities = assertTicketAccess(actor);
  const scope = listScope(actor, options.branchId);
  const includeServed = includeFlag(options.includeServed);
  const station = options.station ?? "ALL";
  if (typeof station !== "string" || !["ALL", "KITCHEN", "BAR"].includes(station)) throw new HttpError(400, "Invalid station");
  const orders = await tx.select().from(posOrders).where(and(scope ? eq(posOrders.branchId, scope) : undefined, actor.role === "SUPER_ADMIN" ? undefined : eq(posOrders.ownerOnly, false)));
  const byId = new Map(orders.map(order => [order.id, order]));
  const rows = await tx.select().from(posProductionTickets).where(and(inArray(posProductionTickets.orderId, [...byId.keys()]), scope ? eq(posProductionTickets.branchId, scope) : undefined, station === "ALL" ? undefined : eq(posProductionTickets.station, station as "KITCHEN" | "BAR"), includeServed ? undefined : inArray(posProductionTickets.status, ["SENT", "PREPARING", "READY"]))).orderBy(asc(posProductionTickets.createdAt), asc(posProductionTickets.id)).limit(POS_LIFECYCLE_LIMIT + 1);
  return { tickets: await Promise.all(rows.slice(0, POS_LIFECYCLE_LIMIT).map(row => ticketDTO(tx, actor, row, byId.get(row.orderId)!))), limit: POS_LIFECYCLE_LIMIT, truncated: rows.length > POS_LIFECYCLE_LIMIT, capabilities };
}
