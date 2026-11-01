import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { semiFgTransfers, semiFgTransferReceipts } from "../../db/schema/semi-fg-transfers";
import { semiFgStock } from "../../db/schema/production";
import { menuItems } from "../../db/schema/menu";
import { branches } from "../../db/schema/platform";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { canonicalJson, numeric, string } from "./http";
import { MAX_QUANTITY, decimal, quantity } from "./production-quantity";
import { assertRequisitionLineFulfillable } from "./requisitions";

// GAP-013. See src/db/schema/semi-fg-transfers.ts for the full design note.
// Branch-to-branch, name-matched destination identity, full idempotent
// partial-receive flow. Cost-carry explicitly out of scope this pass.

export async function dispatchSemiFgTransfer(tx: Executor, actor: Identity, raw: Record<string, unknown>) {
  assertModule(actor, "MENU_BOM");
  const fromBranchId = string(raw.fromBranchId, "fromBranchId");
  const toBranchId = string(raw.toBranchId, "toBranchId");
  if (fromBranchId === toBranchId) throw new HttpError(400, "Source and destination branch must differ");
  const sourceMenuItemId = string(raw.sourceMenuItemId, "sourceMenuItemId");
  const qtyDispatched = numeric(raw.qtyDispatched, "qtyDispatched");
  if (!(Number(qtyDispatched) > 0)) throw new HttpError(400, "qtyDispatched must be positive");
  // Owner can dispatch from any branch; a branch-scoped actor only from their own.
  branchScope(actor, fromBranchId);
  const [toBranch] = await tx.select().from(branches).where(eq(branches.id, toBranchId)).limit(1);
  if (!toBranch) throw new HttpError(400, "Destination branch not found");

  const [sourceItem] = await tx.select().from(menuItems).where(eq(menuItems.id, sourceMenuItemId)).limit(1);
  if (!sourceItem || sourceItem.branchId !== fromBranchId || !sourceItem.isSemiFg) throw new HttpError(400, "Semi-FG item not found at the source branch");

  // Name-matched destination identity (Owner decision — no shared
  // cross-branch catalog id exists this pass). Zero or multiple matches
  // fails closed; never a guessed destination.
  const destCandidates = await tx.select().from(menuItems).where(and(eq(menuItems.branchId, toBranchId), eq(menuItems.isSemiFg, true), eq(menuItems.name, sourceItem.name)));
  if (destCandidates.length === 0) throw new HttpError(409, `No Semi-FG item named "${sourceItem.name}" exists at the destination branch; create one with the exact same name first`);
  if (destCandidates.length > 1) throw new HttpError(409, `Multiple Semi-FG items named "${sourceItem.name}" exist at the destination branch; reconcile the catalog before transferring`);
  const destItem = destCandidates[0];
  if (destItem.outputUnit !== sourceItem.outputUnit) throw new HttpError(409, `Output unit mismatch: source is "${sourceItem.outputUnit}", destination is "${destItem.outputUnit}"`);

  // GAP-014: an optional requisitionLineId declares which internal
  // requisition line this real dispatch fulfills.
  const requisitionLineId = raw.requisitionLineId === undefined ? null : string(raw.requisitionLineId, "requisitionLineId");
  if (requisitionLineId) await assertRequisitionLineFulfillable(tx, requisitionLineId, "PREPARED", toBranchId, qtyDispatched);

  const amount = quantity(qtyDispatched, true);
  const [sourceStock] = await tx.select().from(semiFgStock).where(and(eq(semiFgStock.branchId, fromBranchId), eq(semiFgStock.menuItemId, sourceMenuItemId))).for("update");
  if (!sourceStock || quantity(sourceStock.qtyOnHand, true) < amount) throw new HttpError(409, `Insufficient prepared stock: needs ${qtyDispatched}, has ${sourceStock?.qtyOnHand ?? "0.000"}`);

  const changed = await tx.update(semiFgStock).set({ qtyOnHand: decimal(quantity(sourceStock.qtyOnHand, true) - amount), updatedAt: new Date() })
    .where(eq(semiFgStock.id, sourceStock.id)).returning({ id: semiFgStock.id });
  if (!changed.length) throw new HttpError(409, "Source prepared stock changed; retry");

  const id = randomUUID();
  await tx.insert(semiFgTransfers).values({
    id, fromBranchId, toBranchId, sourceMenuItemId, destMenuItemId: destItem.id, outputUnitAtDispatch: sourceItem.outputUnit,
    qtyDispatched, dispatchedById: actor.id, requisitionLineId,
  });
  const [transfer] = await tx.select().from(semiFgTransfers).where(eq(semiFgTransfers.id, id));
  return transfer;
}

export async function receiveSemiFgTransfer(tx: Executor, actor: Identity, id: string, raw: Record<string, unknown>) {
  const [transfer] = await tx.select().from(semiFgTransfers).where(eq(semiFgTransfers.id, id)).limit(1);
  if (!transfer) throw new HttpError(404, "Transfer not found");
  assertModule(actor, "MENU_BOM");
  branchScope(actor, transfer.toBranchId);

  const [existingReceipt] = await tx.select().from(semiFgTransferReceipts).where(eq(semiFgTransferReceipts.transferId, id)).limit(1);
  if (existingReceipt) {
    if (canonicalJson(existingReceipt.request) !== canonicalJson(raw)) throw new HttpError(409, "Transfer already received with a different request; reconciliation required");
    const [updated] = await tx.select().from(semiFgTransfers).where(eq(semiFgTransfers.id, id));
    const variance = decimal(quantity(transfer.qtyDispatched, true) - quantity(updated.qtyReceived ?? "0", true));
    return { transfer: updated, variance, replayed: true };
  }
  if (transfer.status !== "DISPATCHED") throw new HttpError(409, "Transfer is not awaiting receipt");

  const qtyReceived = numeric(raw.qtyReceived, "qtyReceived");
  const receivedAmount = quantity(qtyReceived, true);
  const dispatchedAmount = quantity(transfer.qtyDispatched, true);
  if (receivedAmount > dispatchedAmount) throw new HttpError(400, "qtyReceived cannot exceed qtyDispatched");

  if (receivedAmount > 0n) {
    const [existingStock] = await tx.select().from(semiFgStock).where(and(eq(semiFgStock.branchId, transfer.toBranchId), eq(semiFgStock.menuItemId, transfer.destMenuItemId))).for("update");
    if (existingStock) {
      const newQty = quantity(existingStock.qtyOnHand, true) + receivedAmount;
      if (newQty > MAX_QUANTITY) throw new HttpError(409, "Prepared stock capacity exceeded");
      await tx.update(semiFgStock).set({ qtyOnHand: decimal(newQty), updatedAt: new Date() }).where(eq(semiFgStock.id, existingStock.id));
    } else {
      await tx.insert(semiFgStock).values({ id: randomUUID(), branchId: transfer.toBranchId, menuItemId: transfer.destMenuItemId, qtyOnHand: decimal(receivedAmount) });
    }
  }

  await tx.insert(semiFgTransferReceipts).values({ id: randomUUID(), transferId: id, actorId: actor.id, request: raw });
  await tx.update(semiFgTransfers).set({ status: "RECEIVED", qtyReceived, receivedById: actor.id, receivedAt: new Date() }).where(eq(semiFgTransfers.id, id));
  const [updated] = await tx.select().from(semiFgTransfers).where(eq(semiFgTransfers.id, id));
  const variance = decimal(dispatchedAmount - receivedAmount);
  return { transfer: updated, variance, replayed: false };
}

export async function listSemiFgTransfers(tx: Executor, actor: Identity, query: { branchId?: string | null } = {}) {
  const scope = branchScope(actor, query.branchId);
  if (!scope) return tx.select().from(semiFgTransfers).orderBy(desc(semiFgTransfers.dispatchedAt)).limit(200);
  return tx.select().from(semiFgTransfers).where(or(eq(semiFgTransfers.fromBranchId, scope), eq(semiFgTransfers.toBranchId, scope))).orderBy(desc(semiFgTransfers.dispatchedAt)).limit(200);
}
