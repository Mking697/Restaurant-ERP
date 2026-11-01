import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { generalPurchaseRequests } from "../../db/schema/purchase";
import type { Executor } from "./auth";
import { assertOwner, HttpError, type Identity } from "./permissions";
import { quantity } from "./production-quantity";

// GAP-016. See src/db/schema/purchase.ts for the full design note — this
// is the missing mandatory-HO gate for general purchases (which skip the
// indent entirely and therefore skipped the Owner's value-threshold policy
// completely until now).

export interface GeneralPurchaseLineInput { itemDescription: string; qty: string; rate: string; }

function parseRateCenti(value: string, label: string): bigint {
  if (typeof value !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new HttpError(400, `Invalid ${label} (decimal string, up to 2 decimal places)`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function centiToDecimal(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

// Exact bigint math: qty (scale 3) x rate (scale 2) per line, summed BEFORE
// any rounding, rounded exactly once at the very end (never per-line) —
// same discipline as GAP-010's cost accumulation.
export function computeGeneralPurchaseValueTsh(lines: GeneralPurchaseLineInput[]): string {
  let numerator = 0n; // scale 5 (qty's 3 + rate's 2)
  for (const line of lines) {
    const qtyMicro = quantity(line.qty, true);
    const rateCenti = parseRateCenti(line.rate, "rate");
    numerator += qtyMicro * rateCenti;
  }
  const valueCenti = (numerator + 500n) / 1000n; // round-half-up once, removing qty's extra scale-3
  return centiToDecimal(valueCenti);
}

// Threshold absent/empty => gate disabled (same convention as
// appliesValueThresholdGate in purchase.ts, duplicated here in bigint-centi
// terms because general-purchase lines never have an "unknown rate" case —
// the requester states the rate directly, there is no vendor-rate lookup).
export function appliesGeneralPurchaseValueGate(valueTsh: string, thresholdTsh: string | null): boolean {
  if (thresholdTsh === null || thresholdTsh.trim() === "") return false;
  return parseRateCenti(valueTsh, "valueTsh") >= parseRateCenti(thresholdTsh, "threshold");
}

function linesEqual(a: GeneralPurchaseLineInput[], b: GeneralPurchaseLineInput[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((lineA, i) => { const lineB = b[i]; return lineA.itemDescription === lineB.itemDescription && lineA.qty === lineB.qty && lineA.rate === lineB.rate; });
}

export async function submitGeneralPurchaseRequest(tx: Executor, actor: Identity, branchId: string, vendorId: string, lines: GeneralPurchaseLineInput[], thresholdTsh: string | null) {
  const valueTsh = computeGeneralPurchaseValueTsh(lines);
  const gated = appliesGeneralPurchaseValueGate(valueTsh, thresholdTsh);
  const id = randomUUID();
  await tx.insert(generalPurchaseRequests).values({
    id, branchId, requestedById: actor.id, vendorId, linesJson: lines, valueTsh,
    status: gated ? "PENDING_APPROVAL" : "APPROVED",
    approvedById: gated ? null : actor.id,
    approvedAt: gated ? null : new Date(),
  });
  const [row] = await tx.select().from(generalPurchaseRequests).where(eq(generalPurchaseRequests.id, id));
  return { request: row, gated };
}

export async function approveGeneralPurchaseRequest(tx: Executor, actor: Identity, id: string) {
  assertOwner(actor);
  const [request] = await tx.select().from(generalPurchaseRequests).where(eq(generalPurchaseRequests.id, id)).limit(1);
  if (!request) throw new HttpError(404, "General purchase request not found");
  if (request.status !== "PENDING_APPROVAL") throw new HttpError(409, "Request already decided or already consumed");
  await tx.update(generalPurchaseRequests).set({ status: "APPROVED", approvedById: actor.id, approvedAt: new Date() }).where(eq(generalPurchaseRequests.id, id));
  const [row] = await tx.select().from(generalPurchaseRequests).where(eq(generalPurchaseRequests.id, id));
  return row;
}

export async function rejectGeneralPurchaseRequest(tx: Executor, actor: Identity, id: string) {
  assertOwner(actor);
  const [request] = await tx.select().from(generalPurchaseRequests).where(eq(generalPurchaseRequests.id, id)).limit(1);
  if (!request) throw new HttpError(404, "General purchase request not found");
  if (request.status !== "PENDING_APPROVAL") throw new HttpError(409, "Request already decided or already consumed");
  await tx.update(generalPurchaseRequests).set({ status: "REJECTED", approvedById: actor.id, approvedAt: new Date() }).where(eq(generalPurchaseRequests.id, id));
  const [row] = await tx.select().from(generalPurchaseRequests).where(eq(generalPurchaseRequests.id, id));
  return row;
}

// Called from inside the Purchase Order creation transaction
// (src/app/api/purchase/orders/route.ts) whenever the SAME threshold check
// applied to this PO's own general-purchase lines would gate it. Consumes
// the request atomically (status -> CONSUMED) so one approval can never
// authorize a second, different purchase — never duplicated dispatch-style
// logic, same one-time-use discipline as GAP-014's requisitionLineId.
export async function assertGeneralPurchaseRequestConsumable(tx: Executor, requestId: string, branchId: string, vendorId: string, lines: GeneralPurchaseLineInput[], valueTsh: string) {
  const [request] = await tx.select().from(generalPurchaseRequests).where(eq(generalPurchaseRequests.id, requestId)).limit(1);
  if (!request) throw new HttpError(400, "General purchase request not found");
  if (request.status !== "APPROVED") throw new HttpError(409, `General purchase request is ${request.status}, not an approved, consumable request`);
  if (request.branchId !== branchId || request.vendorId !== vendorId) throw new HttpError(400, "General purchase request does not match this branch/vendor");
  if (request.valueTsh !== valueTsh || !linesEqual(request.linesJson as GeneralPurchaseLineInput[], lines)) throw new HttpError(409, "The Purchase Order lines/value no longer match the approved request — submit a new request for review");
  await tx.update(generalPurchaseRequests).set({ status: "CONSUMED" }).where(and(eq(generalPurchaseRequests.id, requestId), eq(generalPurchaseRequests.status, "APPROVED")));
}

export async function listGeneralPurchaseRequests(tx: Executor, branchId?: string | null) {
  return tx.select().from(generalPurchaseRequests).where(branchId ? eq(generalPurchaseRequests.branchId, branchId) : undefined).orderBy(generalPurchaseRequests.createdAt);
}
