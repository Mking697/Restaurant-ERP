import { randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { semiFgStock } from "../../db/schema/production";
import { menuItems } from "../../db/schema/menu";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { decimal, quantity } from "./production-quantity";

// GAP-012 (November 2026). Prepared-stock (Semi-FG) min/max par levels —
// SCOPED THIS PASS to threshold-based low/high alerting only. Expiry-aware
// tracking (expired/near-expiry prepared balances) is explicitly DEFERRED
// to a future pass (Owner decision, confirmed via clarify): no lot/batch
// system exists for prepared (Semi-FG) stock yet — building one mirrors
// all of GAP-006's raw-material batch work and is a separate undertaking.
//
// Same "0 means unconfigured" convention as inventoryStock's own
// minStockLevel/maxStockLevel (src/db/schema/inventory.ts): low breach is
// qtyOnHand < minStockLevel (strict — exact equality is NOT a breach);
// high breach is qtyOnHand > maxStockLevel (same rule). The threshold
// belongs to the prepared ITEM's shared stock balance (one bucket per
// branch+item, fed by EITHER Fixed-Recipe or Actual Cutting production —
// the stock itself is fungible once produced, it cannot be split "only
// Actual Cutting's share"), so this evaluator naturally covers whichever
// mode produced the stock. The UI entry point for setting a threshold is
// scoped to the Actual Cutting panel area this pass (Owner decision), but
// the mechanism itself is mode-agnostic by necessity.
export type PreparedBreach = "LOW" | "HIGH" | "OK" | "UNCONFIGURED";
export function evaluatePreparedBreach(qtyOnHand: string, minStockLevel: string, maxStockLevel: string): PreparedBreach {
  const qty = quantity(qtyOnHand, true), min = quantity(minStockLevel, true), max = quantity(maxStockLevel, true);
  if (min === 0n && max === 0n) return "UNCONFIGURED";
  if (min > 0n && qty < min) return "LOW";
  if (max > 0n && qty > max) return "HIGH";
  return "OK";
}

export async function setPreparedStockThresholds(tx: Executor, actor: Identity, branchId: string, menuItemId: string, raw: Record<string, unknown>) {
  assertModule(actor, "MENU_BOM");
  branchScope(actor, branchId);
  if (typeof raw.minStockLevel !== "string" || typeof raw.maxStockLevel !== "string") throw new HttpError(400, "minStockLevel and maxStockLevel are required decimal strings");
  const min = decimal(quantity(raw.minStockLevel, true));
  const max = decimal(quantity(raw.maxStockLevel, true));
  if (quantity(max, true) > 0n && quantity(max, true) < quantity(min, true)) throw new HttpError(400, "Max stock must be at least minimum stock");

  const [item] = await tx.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
  if (!item || !item.isSemiFg || item.branchId !== branchId) throw new HttpError(400, "Semi-FG item not found in this branch");

  const [existing] = await tx.select().from(semiFgStock).where(and(eq(semiFgStock.branchId, branchId), eq(semiFgStock.menuItemId, menuItemId))).limit(1);
  if (existing) {
    const [updated] = await tx.update(semiFgStock).set({ minStockLevel: min, maxStockLevel: max, updatedAt: new Date() }).where(eq(semiFgStock.id, existing.id)).returning();
    return updated;
  }
  // No production has happened yet for this item at this branch — create
  // the row at zero stock so the threshold is already in place the moment
  // the first production posts, rather than silently discarding it.
  const [created] = await tx.insert(semiFgStock).values({ id: randomUUID(), branchId, menuItemId, qtyOnHand: "0.000", minStockLevel: min, maxStockLevel: max }).returning();
  return created;
}

export async function listPreparedStockStatus(tx: Executor, actor: Identity, query: { branchId?: string | null } = {}) {
  const scope = branchScope(actor, query.branchId);
  const rows = await tx.select({ row: semiFgStock, itemName: menuItems.name, outputUnit: menuItems.outputUnit })
    .from(semiFgStock).innerJoin(menuItems, eq(menuItems.id, semiFgStock.menuItemId))
    .where(scope ? eq(semiFgStock.branchId, scope) : undefined).orderBy(menuItems.name);
  return rows.map(({ row, itemName, outputUnit }) => ({
    id: row.id, branchId: row.branchId, menuItemId: row.menuItemId, menuItemName: itemName, outputUnit,
    qtyOnHand: row.qtyOnHand, minStockLevel: row.minStockLevel, maxStockLevel: row.maxStockLevel,
    breach: evaluatePreparedBreach(row.qtyOnHand, row.minStockLevel, row.maxStockLevel),
  }));
}

// Reused by src/lib/server/daily-summary.ts — same shape as its existing
// raw-material lowStockCount query, labeled separately (never merged into
// one combined "low stock" number so raw and prepared stay distinguishable
// per the acceptance criteria).
export async function countPreparedStockBreaches(tx: Executor, branchId: string) {
  const [lowRow] = await tx.select({ count: sql<number>`count(*)` }).from(semiFgStock)
    .where(and(eq(semiFgStock.branchId, branchId), sql`${semiFgStock.minStockLevel} > 0`, lt(semiFgStock.qtyOnHand, semiFgStock.minStockLevel)));
  const [highRow] = await tx.select({ count: sql<number>`count(*)` }).from(semiFgStock)
    .where(and(eq(semiFgStock.branchId, branchId), sql`${semiFgStock.maxStockLevel} > 0`, gt(semiFgStock.qtyOnHand, semiFgStock.maxStockLevel)));
  return { preparedLowStockCount: Number(lowRow?.count ?? 0), preparedHighStockCount: Number(highRow?.count ?? 0) };
}
