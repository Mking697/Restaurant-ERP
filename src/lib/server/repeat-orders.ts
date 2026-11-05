import { and, desc, eq, inArray } from "drizzle-orm";
import { posOrders, posOrderLines } from "../../db/schema/pos";
import { menuItems } from "../../db/schema/menu";
import { customers } from "../../db/schema/customers";
import type { Executor } from "./auth";
import { HttpError, type Identity } from "./permissions";
import { operationalOrderVisibility } from "./order-visibility";

const RECENT_LIMIT = 10;

async function memberPhone(tx: Executor, customerId: string): Promise<string> {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer || customer.status !== "ACTIVE") throw new HttpError(404, "Active member not found");
  return customer.phone;
}

// GAP-041: scoped to the SAME branch the order was placed at and the SAME
// visibility rule every other order read already applies — a hidden
// (ownerOnly) order never surfaces here for a non-Owner, applied at the
// query boundary itself, before any list is returned. Deliberately does
// NOT attempt cross-branch matching (a cloned-menu item's identity on
// another branch is a separately unresolved mapping problem — out of this
// pass's scope, not silently assumed safe).
export async function recentOrdersForMember(tx: Executor, actor: Identity, branchId: string, customerId: string) {
  const phone = await memberPhone(tx, customerId);
  if (!phone) return [];
  return tx.select({ id: posOrders.id, orderNumber: posOrders.orderNumber, channel: posOrders.channel, totalAmount: posOrders.totalAmount, createdAt: posOrders.createdAt })
    .from(posOrders)
    .where(and(eq(posOrders.branchId, branchId), eq(posOrders.customerPhone, phone), inArray(posOrders.status, ["PAID", "COMPLETED"]), operationalOrderVisibility(actor)))
    .orderBy(desc(posOrders.createdAt))
    .limit(RECENT_LIMIT);
}

export interface RepeatOrderLinePreview {
  menuItemId: string;
  nameSnapshot: string | null;
  qty: number;
  originalPrice: string;
  available: boolean;
  reason?: "removed" | "inactive";
  currentPrice?: string;
  priceChanged?: boolean;
  lineTotal?: string;
}

// GAP-041: a READ-ONLY preview — never posts an order itself. Every
// available line's price/tax comes from the CURRENT catalog row, never
// the historical snapshot (so "No silent historical-price reuse" holds by
// construction, not by a separate check someone could forget). The actual
// placement of a repeat order reuses the EXISTING, already-tested
// createPosOrder/addPosOrderLines flow (the cashier adds the SAME
// menuItemIds shown here as a normal new order) — this function's only
// job is to assemble what to re-add and flag what has changed, requiring
// the cashier's own explicit confirmation before anything is submitted.
export async function repeatOrderPreview(tx: Executor, actor: Identity, branchId: string, customerId: string, orderId: string) {
  const phone = await memberPhone(tx, customerId);
  const [order] = await tx.select().from(posOrders)
    .where(and(eq(posOrders.id, orderId), eq(posOrders.branchId, branchId), eq(posOrders.customerPhone, phone), operationalOrderVisibility(actor)))
    .limit(1);
  // Deliberately the same generic 404 whether the order doesn't exist, belongs
  // to a different member, a different branch, or is hidden from this actor —
  // never reveals which case it was (same posture as GAP-040's lookup).
  if (!order) throw new HttpError(404, "Order not found for this member at this branch");

  const lines = await tx.select().from(posOrderLines).where(eq(posOrderLines.orderId, orderId));
  const itemIds = [...new Set(lines.map((l) => l.menuItemId))];
  const currentItems = itemIds.length ? await tx.select().from(menuItems).where(and(eq(menuItems.branchId, branchId), inArray(menuItems.id, itemIds))) : [];
  const byId = new Map(currentItems.map((item) => [item.id, item]));

  const preview: RepeatOrderLinePreview[] = lines.map((line) => {
    const current = byId.get(line.menuItemId);
    if (!current) return { menuItemId: line.menuItemId, nameSnapshot: line.nameSnapshot, qty: line.qty, originalPrice: line.price, available: false, reason: "removed" };
    if (!current.isActive) return { menuItemId: line.menuItemId, nameSnapshot: line.nameSnapshot, qty: line.qty, originalPrice: line.price, available: false, reason: "inactive" };
    const lineTotal = (Number(current.price) * line.qty).toFixed(2);
    return { menuItemId: line.menuItemId, nameSnapshot: line.nameSnapshot, qty: line.qty, originalPrice: line.price, available: true, currentPrice: current.price, priceChanged: current.price !== line.price, lineTotal };
  });

  const previewTotal = preview.filter((l) => l.available).reduce((sum, l) => sum + Number(l.lineTotal), 0).toFixed(2);
  return {
    order: { id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt },
    lines: preview,
    anyUnavailable: preview.some((l) => !l.available),
    anyPriceChanged: preview.some((l) => l.priceChanged),
    previewTotal,
  };
}
