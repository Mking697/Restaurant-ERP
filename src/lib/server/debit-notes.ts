import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { materialReturns, debitNotes, purchaseOrders, grns } from "../../db/schema/purchase";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { string } from "./http";

// GAP-019. Numbered debit notes — see src/db/schema/purchase.ts's design
// note for the 3 Owner decisions (tax treatment deferred; simple 1:1
// claim scope; create/cancel both ACCOUNTS_EXPENSES/Owner-only).

async function loadClaim(tx: Executor, actor: Identity, materialReturnId: string) {
  const [claim] = await tx.select().from(materialReturns).where(eq(materialReturns.id, materialReturnId)).limit(1);
  if (!claim) throw new HttpError(404, "Vendor claim not found");
  branchScope(actor, claim.branchId);
  return claim;
}

function formatDebitNoteNumber(n: number): string {
  return `DN-${String(n).padStart(6, "0")}`;
}

// ACCOUNTS_EXPENSES (Owner always passes) — issues a formal numbered
// credit document for EXACTLY the claim's refundAmountInr. At most one
// NON-CANCELLED debit note per claim at a time (a cancelled one frees the
// claim for a fresh issuance; its own number is never reused).
export async function issueDebitNote(tx: Executor, actor: Identity, materialReturnId: string, input: Record<string, unknown>) {
  assertModule(actor, "ACCOUNTS_EXPENSES");
  const claim = await loadClaim(tx, actor, materialReturnId);
  const reasonNote = string(input.reasonNote, "reasonNote", 500);

  const [activeForClaim] = await tx.select().from(debitNotes).where(and(eq(debitNotes.materialReturnId, materialReturnId), isNull(debitNotes.cancelledAt)));
  if (activeForClaim) {
    throw new HttpError(409, `This claim already has an active debit note (${activeForClaim.debitNoteNumber}) — cancel it first before issuing a new one`);
  }

  const [{ n }] = await tx.execute<{ n: number }>(sql`select nextval('debit_note_seq')::int as n`).then((r) => r.rows ?? r);
  const debitNoteNumber = formatDebitNoteNumber(n);
  const id = randomUUID();
  const [source] = await tx.select({ vendorId: purchaseOrders.vendorId }).from(grns).innerJoin(purchaseOrders, eq(purchaseOrders.id, grns.poId)).where(eq(grns.id, claim.grnId)).limit(1);
  if (!source) throw new HttpError(404, "Source GRN/vendor not found for this claim");
  await tx.insert(debitNotes).values({
    id, debitNoteNumber, materialReturnId, branchId: claim.branchId, vendorId: source.vendorId,
    amountTsh: claim.refundAmountInr, reasonNote, issuedById: actor.id,
  });
  const [note] = await tx.select().from(debitNotes).where(eq(debitNotes.id, id));
  return { debitNote: note };
}

// ACCOUNTS_EXPENSES (Owner always passes) — once-only. Keeps the debit
// note's number and audit trail; never undoes the claim/settlement.
export async function cancelDebitNote(tx: Executor, actor: Identity, debitNoteId: string, input: Record<string, unknown>) {
  assertModule(actor, "ACCOUNTS_EXPENSES");
  const [note] = await tx.select().from(debitNotes).where(eq(debitNotes.id, debitNoteId)).limit(1);
  if (!note) throw new HttpError(404, "Debit note not found");
  branchScope(actor, note.branchId);
  if (note.cancelledAt) throw new HttpError(409, "This debit note is already cancelled");
  const cancelledNote = typeof input.cancelledNote === "string" ? input.cancelledNote.slice(0, 500) : "";
  await tx.update(debitNotes).set({ cancelledAt: new Date(), cancelledById: actor.id, cancelledNote }).where(eq(debitNotes.id, debitNoteId));
  const [updated] = await tx.select().from(debitNotes).where(eq(debitNotes.id, debitNoteId));
  return { debitNote: updated };
}

export async function listDebitNotes(tx: Executor, actor: Identity, materialReturnId: string) {
  await loadClaim(tx, actor, materialReturnId);
  return tx.select().from(debitNotes).where(eq(debitNotes.materialReturnId, materialReturnId)).orderBy(debitNotes.issuedAt);
}
