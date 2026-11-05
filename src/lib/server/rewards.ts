import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { rewardEvents } from "../../db/schema/rewards";
import { posOrders } from "../../db/schema/pos";
import { customers } from "../../db/schema/customers";
import type { Executor } from "./auth";
import { HttpError, type Identity } from "./permissions";

// GAP-039 — owner-approved policy (November 2026). See the long doc comment
// on src/db/schema/rewards.ts for the full decision record; do not change
// these without a fresh explicit owner approval.
export const EARN_TSH_PER_POINT = 1000;
export const REDEEM_TSH_PER_POINT = 50;
export const EXPIRY_MONTHS = 12;

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

async function lockCustomerRewards(tx: Executor, customerId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"reward-ledger:" + customerId}))`);
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

// GAP-039: a reversed event's own points AND its reversal cancel out to
// exactly zero net contribution — this is what lets everyday balance reads
// stay a simple linear sum instead of needing full FIFO lot replay (that
// replay is still done, but only inside expireOldEarns below, where it is
// actually needed to size a specific lot's remaining points).
export function rewardBalance(events: (typeof rewardEvents.$inferSelect)[]): number {
  const reversedIds = new Set(events.filter((e) => e.type === "REVERSE" && e.reversesEventId).map((e) => e.reversesEventId));
  let balance = 0;
  for (const event of events) {
    if (event.type === "REVERSE") continue; // carries no independent weight of its own
    if (reversedIds.has(event.id)) continue; // this EARN/REDEEM was undone — net zero
    if (event.type === "EARN") balance += event.points;
    else balance -= event.points; // REDEEM or EXPIRE
  }
  return balance;
}

async function allEvents(tx: Executor, customerId: string) {
  return tx.select().from(rewardEvents).where(eq(rewardEvents.customerId, customerId)).orderBy(rewardEvents.createdAt);
}

export async function getRewardBalance(tx: Executor, customerId: string) {
  return rewardBalance(await allEvents(tx, customerId));
}

// GAP-039: EARN is tied to a REAL order's REAL recorded total — never a
// client-supplied amount. Reads posOrders itself, verifies PAID/COMPLETED
// eligibility, and is idempotent per order (one EARN per sourceOrderId,
// enforced by the DB unique index — a retried call just returns the
// existing event, never a second one).
export async function earnPoints(tx: Executor, actor: Identity, branchId: string, customerId: string, sourceOrderId: string) {
  const [order] = await tx.select().from(posOrders).where(eq(posOrders.id, sourceOrderId)).limit(1);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== "PAID" && order.status !== "COMPLETED") throw new HttpError(409, "Only a PAID/COMPLETED order is eligible to earn reward points");
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer || customer.status !== "ACTIVE") throw new HttpError(404, "Active member not found");

  const [existing] = await tx.select().from(rewardEvents).where(eq(rewardEvents.sourceOrderId, sourceOrderId)).limit(1);
  if (existing) return existing;

  const points = Math.floor(Number(order.totalAmount) / EARN_TSH_PER_POINT);
  if (points <= 0) return null; // nothing to earn below the per-point threshold — not an error

  try {
    const [row] = await tx.insert(rewardEvents).values({
      id: randomUUID(), customerId, type: "EARN", points, sourceOrderId,
      expiresAt: addMonths(new Date(), EXPIRY_MONTHS), branchId, createdBy: actor.id,
    }).returning();
    return row;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [row] = await tx.select().from(rewardEvents).where(eq(rewardEvents.sourceOrderId, sourceOrderId)).limit(1);
    if (!row) throw error;
    return row;
  }
}

// GAP-039: serialized per customer (advisory lock, same convention as
// lockShiftState) so two concurrent redemption requests can never both
// read the same "available" balance and both succeed — the second always
// re-checks against the balance AFTER the first has committed its event.
export async function redeemPoints(tx: Executor, actor: Identity, branchId: string, customerId: string, pointsInput: unknown) {
  await lockCustomerRewards(tx, customerId);
  const points = Number(pointsInput);
  if (!Number.isInteger(points) || points <= 0) throw new HttpError(400, "Points to redeem must be a positive whole number");
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer || customer.status !== "ACTIVE") throw new HttpError(404, "Active member not found");

  const balance = rewardBalance(await allEvents(tx, customerId));
  if (points > balance) throw new HttpError(409, `Insufficient points — balance is ${balance}, requested ${points}`);

  const amountTsh = (points * REDEEM_TSH_PER_POINT).toFixed(2);
  const [row] = await tx.insert(rewardEvents).values({ id: randomUUID(), customerId, type: "REDEEM", points, amountTsh, branchId, createdBy: actor.id }).returning();
  return row;
}

// GAP-039: voiding the sourceOrderId's own order should claw back its
// earn — idempotent (a retry or an order with no earn at all is a no-op,
// never an error) and structurally cannot double-reverse (the unique
// index on reversesEventId rejects a second REVERSE for the same EARN).
// NOT YET WIRED into the actual POS void/reversal flow — see the
// verification doc's explicit limits; this is a standalone, independently
// callable/testable primitive for that future integration.
export async function reverseEarnForOrder(tx: Executor, actor: Identity, branchId: string, sourceOrderId: string) {
  const [earn] = await tx.select().from(rewardEvents).where(and(eq(rewardEvents.sourceOrderId, sourceOrderId), eq(rewardEvents.type, "EARN"))).limit(1);
  if (!earn) return null; // nothing was ever earned for this order — nothing to reverse
  await lockCustomerRewards(tx, earn.customerId);
  try {
    const [row] = await tx.insert(rewardEvents).values({ id: randomUUID(), customerId: earn.customerId, type: "REVERSE", points: earn.points, reversesEventId: earn.id, branchId, createdBy: actor.id }).returning();
    return row;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [row] = await tx.select().from(rewardEvents).where(eq(rewardEvents.reversesEventId, earn.id)).limit(1);
    return row ?? null; // already reversed — idempotent no-op
  }
}

// GAP-039: FIFO lot expiry — the full point-by-point replay documented on
// rewardBalance's own comment is only actually needed HERE, to size each
// specific aged-out EARN lot's remaining (post-redemption) balance before
// posting its EXPIRE event. Safe to call repeatedly/for any customer at any
// time (e.g. a daily cron) — a lot that has nothing left to expire, or
// that was already reversed/expired, is simply skipped; the unique index
// on reversesEventId is the backstop against ever double-expiring one lot.
export async function expireOldEarns(tx: Executor, actor: Identity, branchId: string, customerId: string, now = new Date()) {
  // Must take the SAME per-customer advisory lock as redeemPoints/
  // reverseEarnForOrder — without it, a concurrent redeemPoints call could
  // commit between this function's own event read and its EXPIRE insert,
  // leaving the computed "remaining" lot size stale (computed against a
  // balance that no longer reflects the just-committed redemption) and
  // posting an EXPIRE for more points than the lot actually still has,
  // corrupting the ledger's balance even though the unique index on
  // reversesEventId prevents double-expiring the SAME lot twice.
  await lockCustomerRewards(tx, customerId);
  const events = await allEvents(tx, customerId);
  const reversedIds = new Set(events.filter((e) => e.type === "REVERSE" && e.reversesEventId).map((e) => e.reversesEventId));
  const lots = events.filter((e) => e.type === "EARN" && !reversedIds.has(e.id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const alreadyExpiredOrReversed = new Set([...reversedIds, ...events.filter((e) => e.type === "EXPIRE" && e.reversesEventId).map((e) => e.reversesEventId)]);

  let consumedSoFar = events.filter((e) => e.type === "REDEEM" && !reversedIds.has(e.id)).reduce((sum, e) => sum + e.points, 0)
    + events.filter((e) => e.type === "EXPIRE").reduce((sum, e) => sum + e.points, 0);

  const posted: (typeof rewardEvents.$inferSelect)[] = [];
  for (const lot of lots) {
    const usedFromThisLot = Math.min(lot.points, consumedSoFar);
    const remaining = lot.points - usedFromThisLot;
    consumedSoFar -= usedFromThisLot;
    if (remaining <= 0) continue;
    if (alreadyExpiredOrReversed.has(lot.id)) continue;
    if (!lot.expiresAt || lot.expiresAt.getTime() > now.getTime()) continue;
    try {
      const [row] = await tx.insert(rewardEvents).values({ id: randomUUID(), customerId, type: "EXPIRE", points: remaining, reversesEventId: lot.id, branchId, createdBy: actor.id }).returning();
      posted.push(row);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error; // another run already settled this exact lot
    }
  }
  return posted;
}
