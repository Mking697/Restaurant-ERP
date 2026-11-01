import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { inventoryStock, nightVarianceEntries, wastageLogs } from "../../db/schema/inventory";
import { vendorRates } from "../../db/schema/vendors";
import type { Executor } from "./auth";
import { HttpError } from "./permissions";
import { numeric, string } from "./http";
import { allowedFields } from "./purchase";
import { decimal, MAX_QUANTITY, quantity } from "./production-quantity";
import { businessDateString } from "./business-calendar";
import { postStockMovement } from "./stock-ledger";
import { allocateConsume, allocateExpiredConsume, creditBatch } from "./stock-batches";

// GAP-004 remaining-scope follow-up (October 31, 2026): wastage write-offs
// and physical stock counts ("night variance") are the LAST two branch-level
// RAW MATERIAL movement types this GAP's ledger needed — GRN receipt,
// production/POS consumption and Semi-FG production/consumption were wired
// in earlier slices this session. Neither wastageLogs nor nightVarianceEntries
// (src/db/schema/inventory.ts) had ANY writer before this — both tables were
// schema groundwork only, with a read-only report (/api/inventory/variance)
// that could only ever show empty results. This slice builds the real write
// paths AND wires them into the ledger in the same pass (no half-migrated
// ledger — this GAP's own standing rule).

export const WASTAGE_REASONS = ["expired", "dropped", "burnt"] as const;
export type WastageReason = (typeof WASTAGE_REASONS)[number];

export interface WastageInput { rawMaterialId: string; qty: string; reason: WastageReason; photoUrl: string; }
export function parseWastageInput(input: Record<string, unknown>): WastageInput {
  allowedFields(input, ["rawMaterialId", "qty", "reason", "photoUrl"]);
  const rawMaterialId = string(input.rawMaterialId, "rawMaterialId");
  const qty = numeric(input.qty, "qty");
  if (Number(qty) <= 0) throw new HttpError(400, "qty must be greater than zero");
  if (!WASTAGE_REASONS.includes(input.reason as WastageReason)) throw new HttpError(400, `reason must be one of: ${WASTAGE_REASONS.join(", ")}`);
  // "Mandatory proof" per wastageLogs' own schema comment — never a silent/blank write-off.
  const photoUrl = string(input.photoUrl, "photoUrl", 2000);
  return { rawMaterialId, qty, reason: input.reason as WastageReason, photoUrl };
}

// Debits inventory_stock (real stock, cannot waste more than is actually on
// hand — fails closed, same conservation guarantee as deductStock), inserts
// the wastageLogs audit row, and posts an audited parallel ledger entry.
export async function logWastage(tx: Executor, actor: { id: string }, branchId: string, input: WastageInput) {
  const amount = quantity(input.qty, true);
  const rows = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.branchId, branchId), eq(inventoryStock.rawMaterialId, input.rawMaterialId))).limit(2).for("update");
  if (rows.length > 1) throw new HttpError(409, "Duplicate raw stock rows; reconcile inventory first");
  const [existing] = rows;
  const available = existing ? quantity(existing.qtyOnHand, true) : 0n;
  if (available < amount) throw new HttpError(409, `Insufficient stock to write off: available ${existing ? existing.qtyOnHand : "0.000"}, requested ${input.qty}`);
  // GAP-006: pick WHICH batches this write-off actually comes from.
  // reason:"expired" is the ONLY mechanism for removing expired stock
  // (per the Owner's hard-block policy) — it draws ONLY from expired
  // batches and hard-rejects if less is actually expired than claimed.
  // reason:"dropped"/"burnt" represents stock that was genuinely in
  // active use when lost, so it draws FEFO across ALL batches (expired or
  // not — if only expired stock remains, it can still be logged as lost).
  const logId = randomUUID();
  const source = { actorId: actor.id, sourceType: "WASTAGE", sourceId: logId };
  if (input.reason === "expired") await allocateExpiredConsume(tx, branchId, input.rawMaterialId, input.qty, source);
  else await allocateConsume(tx, branchId, input.rawMaterialId, input.qty, { allowExpired: true, ...source });
  await tx.update(inventoryStock).set({ qtyOnHand: decimal(available - amount), updatedAt: new Date() }).where(eq(inventoryStock.id, existing!.id));

  await tx.insert(wastageLogs).values({
    id: logId, branchId, rawMaterialId: input.rawMaterialId, qty: input.qty,
    reason: input.reason, photoUrl: input.photoUrl, loggedById: actor.id,
  });
  await postStockMovement(tx, {
    branchId, rawMaterialId: input.rawMaterialId, qtyDelta: -amount,
    movementType: "WASTAGE_WRITE_OFF", sourceType: "WASTAGE", sourceId: logId, actorId: actor.id,
  });
  const [log] = await tx.select().from(wastageLogs).where(eq(wastageLogs.id, logId));
  return log;
}

// The real counted quantity at a physical stock count. theoreticalQty is
// NOT client-supplied — it's the system's own qtyOnHand snapshot AT COUNT
// TIME (what the system currently believes is on hand), captured server-side
// so it can never be faked by the submitter. flaggedPilferage is the
// counting staff's own manual judgment call (not an auto-computed threshold
// — no Owner-approved pilferage-detection rule exists yet; inventing one
// here would be exactly the "never fabricate a number/policy" violation
// this project explicitly avoids elsewhere, e.g. business-policy.ts).
export interface NightVarianceInput { rawMaterialId: string; physicalQty: string; shiftDate: string; flaggedPilferage: boolean; }
export function parseNightVarianceInput(input: Record<string, unknown>): NightVarianceInput {
  allowedFields(input, ["rawMaterialId", "physicalQty", "shiftDate", "flaggedPilferage"]);
  const rawMaterialId = string(input.rawMaterialId, "rawMaterialId");
  const physicalQty = numeric(input.physicalQty, "physicalQty");
  const shiftDate = input.shiftDate === undefined || input.shiftDate === null || input.shiftDate === ""
    ? businessDateString()
    : string(input.shiftDate, "shiftDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) throw new HttpError(400, "shiftDate must be YYYY-MM-DD");
  if (input.flaggedPilferage !== undefined && typeof input.flaggedPilferage !== "boolean") throw new HttpError(400, "flaggedPilferage must be a boolean");
  return { rawMaterialId, physicalQty, shiftDate, flaggedPilferage: input.flaggedPilferage === true };
}

// Fail-closed, same convention as purchase.ts's estimateIndentValueTsh: a
// variance in a raw material with NO locked vendor rate cannot be priced
// honestly, so this throws rather than fabricating a 0/guessed value —
// nightVarianceEntries.varianceValueInr is NOT NULL and must be real.
async function latestLockedRate(tx: Executor, rawMaterialId: string): Promise<string | null> {
  const [row] = await tx.select({ rate: vendorRates.rate }).from(vendorRates).where(eq(vendorRates.rawMaterialId, rawMaterialId)).orderBy(desc(vendorRates.lockedAt), desc(vendorRates.id)).limit(1);
  return row?.rate ?? null;
}

export async function submitNightVariance(tx: Executor, actor: { id: string }, branchId: string, input: NightVarianceInput) {
  const [dupe] = await tx.select({ id: nightVarianceEntries.id }).from(nightVarianceEntries)
    .where(and(eq(nightVarianceEntries.branchId, branchId), eq(nightVarianceEntries.rawMaterialId, input.rawMaterialId), eq(nightVarianceEntries.shiftDate, input.shiftDate)))
    .limit(1);
  if (dupe) throw new HttpError(409, "A physical count has already been submitted for this material on this shift date");

  const rate = await latestLockedRate(tx, input.rawMaterialId);
  if (rate === null) throw new HttpError(409, "No locked vendor rate exists for this material; cannot value the variance honestly");

  const rows = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.branchId, branchId), eq(inventoryStock.rawMaterialId, input.rawMaterialId))).limit(2).for("update");
  if (rows.length > 1) throw new HttpError(409, "Duplicate raw stock rows; reconcile inventory first");
  const [existing] = rows;
  const theoretical = existing ? quantity(existing.qtyOnHand, true) : 0n;
  const physical = quantity(input.physicalQty, true);
  if (physical > MAX_QUANTITY) throw new HttpError(409, "Physical count exceeds capacity");
  const variance = physical - theoretical; // signed: positive = found extra, negative = shortage

  const varianceValuePaise = (variance * toPaise(rate)) / 1000n;

  if (existing) {
    await tx.update(inventoryStock).set({ qtyOnHand: decimal(physical), updatedAt: new Date() }).where(eq(inventoryStock.id, existing.id));
  } else if (physical > 0n) {
    await tx.insert(inventoryStock).values({ id: randomUUID(), branchId, rawMaterialId: input.rawMaterialId, qtyOnHand: decimal(physical), minStockLevel: "0", maxStockLevel: "0" });
  }
  // GAP-006: reconcile stockBatches alongside inventory_stock, same
  // invariant as every other RAW writer. A shortfall (variance < 0) is
  // drawn FEFO across ALL batches, expired or not — a physical count
  // shortfall could legitimately be missing stock of any age, not just
  // non-expired, and this is already the audited REAL reduction (not a
  // prevented consumption), so the hard-block doesn't apply here. A
  // surplus (variance > 0) cannot be assigned a real expiry date (the
  // count doesn't say which lot the extra came from) — it becomes one new
  // batch with expiryDate: null ("unknown origin"), not a fabricated date.
  const entryId = randomUUID();
  const source = { actorId: actor.id, sourceType: "NIGHT_VARIANCE", sourceId: entryId };
  if (variance < 0n) await allocateConsume(tx, branchId, input.rawMaterialId, decimal(-variance), { allowExpired: true, ...source });
  else if (variance > 0n) await creditBatch(tx, branchId, input.rawMaterialId, decimal(variance), null, "", source);
  await tx.insert(nightVarianceEntries).values({
    id: entryId, branchId, rawMaterialId: input.rawMaterialId, shiftDate: input.shiftDate,
    theoreticalQty: decimal(theoretical), physicalQty: decimal(physical), varianceQty: signedDecimal(variance),
    varianceValueInr: signedMoneyDecimal(varianceValuePaise), chefOnDutyId: actor.id, flaggedPilferage: input.flaggedPilferage,
  });
  if (variance !== 0n) {
    await postStockMovement(tx, {
      branchId, rawMaterialId: input.rawMaterialId, qtyDelta: variance,
      movementType: "PHYSICAL_COUNT_ADJUST", sourceType: "NIGHT_VARIANCE", sourceId: entryId, actorId: actor.id,
    });
  }
  const [entry] = await tx.select().from(nightVarianceEntries).where(eq(nightVarianceEntries.id, entryId));
  return entry;
}

function toPaise(rate: string): bigint {
  const [whole, fraction = ""] = rate.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}
function signedDecimal(millis: bigint): string {
  const negative = millis < 0n;
  const abs = negative ? -millis : millis;
  return `${negative ? "-" : ""}${decimal(abs)}`;
}
function signedMoneyDecimal(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}
