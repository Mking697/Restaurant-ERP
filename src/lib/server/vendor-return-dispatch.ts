import { randomUUID } from "node:crypto";
import { eq, sum } from "drizzle-orm";
import { materialReturns, materialReturnDispatches } from "../../db/schema/purchase";
import type { Executor } from "./auth";
import { assertModule, assertOwner, branchScope, HttpError, type Identity } from "./permissions";
import { string } from "./http";
import { quantity, decimal } from "./production-quantity";

// GAP-018. Physical purchase-return lifecycle — see
// src/db/schema/purchase.ts's design note for the full scope (EXISTING
// FAIL/PARTIAL-quality claim type only; already-accepted-stock returns are
// a separate, out-of-scope future design).

async function loadClaim(tx: Executor, actor: Identity, materialReturnId: string) {
  const [claim] = await tx.select().from(materialReturns).where(eq(materialReturns.id, materialReturnId)).limit(1);
  if (!claim) throw new HttpError(404, "Vendor claim not found");
  branchScope(actor, claim.branchId);
  return claim;
}

async function dispatchedSoFar(tx: Executor, materialReturnId: string): Promise<bigint> {
  const [row] = await tx.select({ total: sum(materialReturnDispatches.qtyDispatched) }).from(materialReturnDispatches).where(eq(materialReturnDispatches.materialReturnId, materialReturnId));
  return quantity(row?.total ?? "0", true);
}

// PURCHASE_ORDER grant — same actor who registers the claim can record
// that the physical rejected stock was actually sent back to the vendor.
// Partial dispatch across several trips is allowed; sum(qtyDispatched)
// can never exceed the claim's qtyReturned.
export async function recordReturnDispatch(tx: Executor, actor: Identity, materialReturnId: string, input: Record<string, unknown>) {
  assertModule(actor, "PURCHASE_ORDER");
  const claim = await loadClaim(tx, actor, materialReturnId);
  if (claim.remainingCancelledAt) throw new HttpError(409, "The remaining undispatched quantity for this claim has been cancelled");

  const qtyDispatched = quantity(input.qtyDispatched);
  const reasonNote = string(input.reasonNote, "reasonNote", 500);
  const evidencePhotoUrl = typeof input.evidencePhotoUrl === "string" ? input.evidencePhotoUrl.slice(0, 500) : "";

  const already = await dispatchedSoFar(tx, materialReturnId);
  const claimQty = quantity(claim.qtyReturned, true);
  if (already + qtyDispatched > claimQty) {
    throw new HttpError(409, `This dispatch would exceed the claim's returnable quantity (claimed ${claim.qtyReturned}, already dispatched ${decimal(already)}, this dispatch ${decimal(qtyDispatched)})`);
  }

  const id = randomUUID();
  await tx.insert(materialReturnDispatches).values({
    id, materialReturnId, branchId: claim.branchId, qtyDispatched: decimal(qtyDispatched),
    reasonNote, evidencePhotoUrl, dispatchedById: actor.id,
  });
  const [dispatch] = await tx.select().from(materialReturnDispatches).where(eq(materialReturnDispatches.id, id));
  return { dispatch, remainingQty: decimal(claimQty - (already + qtyDispatched)) };
}

// PURCHASE_ORDER grant — records that staff have a real signed slip/
// confirmation from the vendor acknowledging receipt of THIS specific
// dispatch. Once-only.
export async function acknowledgeReturnDispatch(tx: Executor, actor: Identity, dispatchId: string) {
  assertModule(actor, "PURCHASE_ORDER");
  const [dispatch] = await tx.select().from(materialReturnDispatches).where(eq(materialReturnDispatches.id, dispatchId)).limit(1);
  if (!dispatch) throw new HttpError(404, "Return dispatch not found");
  branchScope(actor, dispatch.branchId);
  if (dispatch.vendorAcknowledgedAt) throw new HttpError(409, "This dispatch is already vendor-acknowledged");
  await tx.update(materialReturnDispatches).set({ vendorAcknowledgedAt: new Date(), vendorAcknowledgedById: actor.id }).where(eq(materialReturnDispatches.id, dispatchId));
  const [updated] = await tx.select().from(materialReturnDispatches).where(eq(materialReturnDispatches.id, dispatchId));
  return { dispatch: updated };
}

// Owner-only — cancels the REMAINING undispatched quantity only; never
// touches an already-created dispatch row. Once-only; rejects if nothing
// remains to cancel (claim is already fully dispatched).
export async function cancelRemainingReturnDispatch(tx: Executor, actor: Identity, materialReturnId: string, input: Record<string, unknown>) {
  assertOwner(actor);
  const claim = await loadClaim(tx, actor, materialReturnId);
  if (claim.remainingCancelledAt) throw new HttpError(409, "The remaining undispatched quantity is already cancelled");
  const already = await dispatchedSoFar(tx, materialReturnId);
  const claimQty = quantity(claim.qtyReturned, true);
  if (already >= claimQty) throw new HttpError(409, "This claim is already fully dispatched — nothing remains to cancel");
  const remainingCancelledNote = typeof input.remainingCancelledNote === "string" ? input.remainingCancelledNote.slice(0, 500) : "";
  await tx.update(materialReturns).set({ remainingCancelledAt: new Date(), remainingCancelledById: actor.id, remainingCancelledNote }).where(eq(materialReturns.id, materialReturnId));
  const [updated] = await tx.select().from(materialReturns).where(eq(materialReturns.id, materialReturnId));
  return { return: updated, cancelledQty: decimal(claimQty - already) };
}

export async function listReturnDispatches(tx: Executor, actor: Identity, materialReturnId: string) {
  await loadClaim(tx, actor, materialReturnId);
  return tx.select().from(materialReturnDispatches).where(eq(materialReturnDispatches.materialReturnId, materialReturnId)).orderBy(materialReturnDispatches.dispatchedAt);
}
