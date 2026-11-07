import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { menuItems } from "../../db/schema/menu";
import { inventoryStock } from "../../db/schema/inventory";
import { semiFgStock } from "../../db/schema/production";
import { posDocuments } from "../../db/schema/pos-documents";
import { posOrderLines, posOrders, posProductionTicketLines, posProductionTickets, posReceipts } from "../../db/schema/pos";
import { posPayments } from "../../db/schema/pos-payments";
import { posOrderReversals } from "../../db/schema/pos-order-reversals";
import type { Executor } from "./auth";
import { assertAllowedFields } from "./pos-order-policy";
import { HttpError, type Identity } from "./permissions";
import { lifecycleCapabilities } from "./pos-lifecycle-policy";
import { decimal, directRequirements } from "./production-quantity";
import { readStockRecipe, lockRecipeStock } from "./production";
import { postStockMovement } from "./stock-ledger";
import { postPosSaleVoidJournal } from "./accounts-ledger";
import { reverseEarnForOrder } from "./rewards";
import type { OrderReversal, OrderReversalLine } from "../pos-order-reversals";

function reversalDTO(row: typeof posOrderReversals.$inferSelect): OrderReversal {
  return {
    id: row.id, orderId: row.orderId, branchId: row.branchId, reason: row.reason,
    actorId: row.actorId, actorName: row.actorName, priorStatus: row.priorStatus as "PAID" | "COMPLETED",
    paymentId: row.paymentId, receiptId: row.receiptId, finalDocumentId: row.finalDocumentId,
    cogsAmountAtVoid: row.cogsAmountAtVoid, refundLiabilityAmount: row.refundLiabilityAmount,
    restockedLines: row.restockedLines as OrderReversalLine[], wastedLines: row.wastedLines as OrderReversalLine[],
    createdAt: row.createdAt.toISOString(),
  };
}

function voidReason(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "A void reason (3-500 characters) is required");
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500) throw new HttpError(400, "A void reason (3-500 characters) is required");
  return reason;
}

function assertVoidAuthority(actor: Identity, order: { branchId: string; ownerOnly: boolean }) {
  if (order.ownerOnly && actor.role !== "SUPER_ADMIN") throw new HttpError(404, "Order not found");
  if (!lifecycleCapabilities(actor).canCancel) throw new HttpError(403, "Manager or Owner authorization is required to void a paid order");
  if (actor.role !== "SUPER_ADMIN" && actor.branchId !== order.branchId) throw new HttpError(403, "Cannot void an order outside your own branch");
}

export async function readOrderReversal(tx: Executor, actor: Identity, orderId: string): Promise<OrderReversal | null> {
  const [order] = await tx.select({ branchId: posOrders.branchId, ownerOnly: posOrders.ownerOnly }).from(posOrders).where(eq(posOrders.id, orderId)).limit(1);
  if (!order || (order.ownerOnly && actor.role !== "SUPER_ADMIN")) throw new HttpError(404, "Order not found");
  if (actor.role !== "SUPER_ADMIN" && actor.branchId !== order.branchId) throw new HttpError(403, "Cannot read reversal outside your own branch");
  const [row] = await tx.select().from(posOrderReversals).where(eq(posOrderReversals.orderId, orderId)).limit(1);
  return row ? reversalDTO(row) : null;
}

/**
 * GAP-027: manager/Owner void of an already PAID/COMPLETED order. Never
 * mutates the original payment/receipt/FINAL/COGS rows (GAP-026 payments
 * are immutable) — creates one append-only reversal record instead.
 * Unprepared lines (ticket never reached SERVED, or had none) genuinely
 * restock via the existing stock-ledger seam; already-SERVED lines are
 * recorded as waste in the reversal row only — no new wastage-ledger
 * posting in this pass (owner-approved scope). Idempotent on exact reason;
 * a different reason on an already-voided order is rejected.
 */
export async function voidPosOrder(tx: Executor, actor: Identity, orderId: string, input: Record<string, unknown>): Promise<{ order: { id: string; status: "VOIDED" }; reversal: OrderReversal; replayed?: boolean }> {
  assertAllowedFields(input, ["reason"]);
  const reason = voidReason(input.reason);
  const [order] = await tx.select().from(posOrders).where(eq(posOrders.id, orderId)).limit(1);
  if (!order) throw new HttpError(404, "Order not found");
  assertVoidAuthority(actor, order);

  if (order.status === "VOIDED") {
    const [existing] = await tx.select().from(posOrderReversals).where(eq(posOrderReversals.orderId, orderId)).limit(1);
    if (!existing) throw new HttpError(409, "Order is VOIDED without a reversal record; cannot be voided again here");
    if (existing.reason !== reason) throw new HttpError(409, "Order already voided with a different reason; this is not a duplicate replay");
    return { order: { id: orderId, status: "VOIDED" }, reversal: reversalDTO(existing), replayed: true };
  }
  if (!["PAID", "COMPLETED"].includes(order.status)) throw new HttpError(409, "Only a PAID or COMPLETED order can be voided here; an OPEN order uses the existing cancel action");

  const [payment] = await tx.select().from(posPayments).where(eq(posPayments.orderId, orderId)).limit(1);
  const [receipt] = await tx.select().from(posReceipts).where(eq(posReceipts.orderId, orderId)).limit(1);
  const [final] = await tx.select().from(posDocuments).where(and(eq(posDocuments.orderId, orderId), eq(posDocuments.kind, "FINAL"))).limit(1);

  const lines = await tx.select({ id: posOrderLines.id, menuItemId: posOrderLines.menuItemId, qty: posOrderLines.qty, name: posOrderLines.nameSnapshot }).from(posOrderLines).where(eq(posOrderLines.orderId, orderId));
  const tickets = await tx.select({ id: posProductionTickets.id, status: posProductionTickets.status }).from(posProductionTickets).where(eq(posProductionTickets.orderId, orderId));
  const ticketLines = tickets.length ? await tx.select({ orderLineId: posProductionTicketLines.orderLineId, ticketId: posProductionTicketLines.ticketId }).from(posProductionTicketLines).where(inArray(posProductionTicketLines.ticketId, tickets.map(t => t.id))) : [];
  const ticketStatusById = new Map(tickets.map(t => [t.id, t.status]));
  const servedLineIds = new Set(ticketLines.filter(tl => ticketStatusById.get(tl.ticketId) === "SERVED").map(tl => tl.orderLineId));
  const trackedLineIds = new Set(ticketLines.map(tl => tl.orderLineId));

  // Conservative default: a line with no ticket at all (no production
  // station, e.g. a straight packaged item) is treated as already given to
  // the customer — waste, not restock — since there is no evidence it was
  // never handed over.
  let restockable = lines.filter(line => trackedLineIds.has(line.id) && !servedLineIds.has(line.id));
  let wasted = lines.filter(line => !restockable.includes(line));

  const nameFor = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string>();
    const rows = await tx.select({ id: menuItems.id, name: menuItems.name }).from(menuItems).where(inArray(menuItems.id, ids));
    return new Map(rows.map(row => [row.id, row.name]));
  };
  const names = await nameFor([...new Set(lines.map(line => line.menuItemId))]);
  const toLineDTO = (line: { menuItemId: string; qty: number; name: string | null }): OrderReversalLine => ({ menuItemId: line.menuItemId, name: line.name ?? names.get(line.menuItemId) ?? "", qty: line.qty });

  if (restockable.length) {
    try {
      await lockRecipeStock(tx, order.branchId);
      const demands = restockable.map(line => ({ menuItemId: line.menuItemId, quantity: String(line.qty) }));
      const recipeRows = await readStockRecipe(tx, order.branchId, [...new Set(demands.map(d => d.menuItemId))]);
      const required = directRequirements(order.branchId, recipeRows, demands);
      for (const [rawMaterialId, amount] of required.raw) {
        await tx.update(inventoryStock).set({ qtyOnHand: sql`${inventoryStock.qtyOnHand} + ${decimal(amount)}::numeric` }).where(and(eq(inventoryStock.branchId, order.branchId), eq(inventoryStock.rawMaterialId, rawMaterialId)));
        await postStockMovement(tx, { branchId: order.branchId, rawMaterialId, qtyDelta: amount, movementType: "ORDER_VOID_RESTOCK", sourceType: "POS_ORDER_VOID", sourceId: orderId, actorId: actor.id });
      }
      for (const [menuItemId, amount] of required.semiFg) {
        await tx.update(semiFgStock).set({ qtyOnHand: sql`${semiFgStock.qtyOnHand} + ${decimal(amount)}::numeric` }).where(and(eq(semiFgStock.branchId, order.branchId), eq(semiFgStock.menuItemId, menuItemId)));
        await postStockMovement(tx, { branchId: order.branchId, menuItemId, qtyDelta: amount, movementType: "ORDER_VOID_RESTOCK", sourceType: "POS_ORDER_VOID", sourceId: orderId, actorId: actor.id });
      }
    } catch {
      // A void authorization must never be blocked by a since-edited/missing
      // BOM recipe. Fall back to recording these lines as waste instead —
      // no partial/silent restock, no invented stock movement either.
      wasted = [...wasted, ...restockable];
      restockable = [];
    }
  }

  const [updated] = await tx.update(posOrders).set({ status: "VOIDED", voidReason: reason, voidedAt: new Date(), revision: order.revision + 1 }).where(and(eq(posOrders.id, orderId), eq(posOrders.revision, order.revision), eq(posOrders.status, order.status))).returning();
  if (!updated) throw new HttpError(409, "Order changed concurrently; reload and retry");

  if (order.tenderType) await postPosSaleVoidJournal(tx, actor, { id: orderId, branchId: order.branchId, tenderType: order.tenderType, subtotal: order.subtotal, taxAmount: order.taxAmount });
  // Nov 2026 (review finding): reverseEarnForOrder already existed (GAP-039)
  // as a standalone, independently-callable primitive with its own manual
  // API route, but was never actually wired into the real void flow — a
  // voided order's earned reward points stayed credited to the customer
  // forever unless a human separately remembered to call the manual
  // reverse endpoint. Idempotent/no-op if nothing was ever earned for this
  // order (see reverseEarnForOrder's own doc comment) — safe to always call.
  await reverseEarnForOrder(tx, actor, order.branchId, orderId);

  const [reversal] = await tx.insert(posOrderReversals).values({
    id: randomUUID(), orderId, branchId: order.branchId, reason, actorId: actor.id, actorName: actor.name,
    priorStatus: order.status as "PAID" | "COMPLETED", paymentId: payment?.id ?? null, receiptId: receipt?.id ?? null, finalDocumentId: final?.id ?? null,
    cogsAmountAtVoid: order.cogsAmount, refundLiabilityAmount: payment?.amount ?? null,
    restockedLines: restockable.map(toLineDTO), wastedLines: wasted.map(toLineDTO),
  }).returning();

  return { order: { id: orderId, status: "VOIDED" }, reversal: reversalDTO(reversal) };
}
