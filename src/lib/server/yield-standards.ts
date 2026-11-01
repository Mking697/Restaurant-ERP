import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { menuItems } from "../../db/schema/menu";
import { actualCuttingProductions } from "../../db/schema/cutting-production";
import { cuttingYieldStandards, cuttingYieldDeviations } from "../../db/schema/yield-standards";
import type { Executor } from "./auth";
import { assertOwner, branchScope, HttpError, type Identity } from "./permissions";

// GAP-011. See src/db/schema/yield-standards.ts for the full design note.
// Scope: Actual Cutting only, SOFT flag (never blocks), Owner-only authority
// for both setting a standard and reviewing a flagged deviation.

function percentCenti(value: string): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m) throw new HttpError(400, "Invalid percent (decimal string, up to 2 decimal places)");
  const [, whole, frac = ""] = m;
  if (frac.length > 2) throw new HttpError(400, "Percent supports at most 2 decimal places");
  return BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
}
function centiToPercentDecimal(centi: bigint): string {
  const neg = centi < 0n;
  const abs = neg ? -centi : centi;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

export async function setYieldStandard(tx: Executor, actor: Identity, menuItemId: string, raw: Record<string, unknown>) {
  assertOwner(actor);
  if (typeof raw.minYieldPercent !== "string" || typeof raw.maxYieldPercent !== "string") throw new HttpError(400, "minYieldPercent and maxYieldPercent are required decimal strings");
  const minCenti = percentCenti(raw.minYieldPercent);
  const maxCenti = percentCenti(raw.maxYieldPercent);
  if (minCenti < 0n || maxCenti > 10000n || minCenti > maxCenti) throw new HttpError(400, "Invalid yield band: 0 <= min <= max <= 100");

  const [item] = await tx.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
  if (!item || !item.isSemiFg) throw new HttpError(400, "Semi-FG item not found");

  const id = randomUUID();
  // Supersede the current standard (if any) and insert the new one as a
  // single atomic step — never two standards with supersededAt NULL at once.
  await tx.update(cuttingYieldStandards).set({ supersededAt: new Date() }).where(and(eq(cuttingYieldStandards.menuItemId, menuItemId), isNull(cuttingYieldStandards.supersededAt)));
  const [standard] = await tx.insert(cuttingYieldStandards).values({
    id, menuItemId, minYieldPercent: centiToPercentDecimal(minCenti), maxYieldPercent: centiToPercentDecimal(maxCenti), approvedById: actor.id,
  }).returning();
  return standard;
}

export async function currentYieldStandard(tx: Executor, menuItemId: string) {
  const [standard] = await tx.select().from(cuttingYieldStandards).where(and(eq(cuttingYieldStandards.menuItemId, menuItemId), isNull(cuttingYieldStandards.supersededAt))).limit(1);
  return standard ?? null;
}

// Called from recordActualCutting AFTER the production row is committed.
// outputMassKg/inputTotalKg are the exact bigint-milli values already
// computed there (never re-parsed from strings, avoiding a second source
// of rounding). Returns null when no current standard exists for this item
// (an explicit "nothing to evaluate" — not a fabricated default band) or
// when the production falls within the approved band (inclusive at both
// ends — the exact boundary is NOT a breach).
export async function evaluateYieldDeviation(tx: Executor, cuttingProductionId: string, menuItemId: string, outputMassMilli: bigint, inputTotalMilli: bigint) {
  const standard = await currentYieldStandard(tx, menuItemId);
  if (!standard) return null;
  const yieldCenti = divRoundHalfUp(outputMassMilli * 10000n, inputTotalMilli);
  const minCenti = percentCenti(standard.minYieldPercent);
  const maxCenti = percentCenti(standard.maxYieldPercent);
  if (yieldCenti >= minCenti && yieldCenti <= maxCenti) return null;
  const id = randomUUID();
  const [deviation] = await tx.insert(cuttingYieldDeviations).values({
    id, cuttingProductionId, standardId: standard.id, yieldPercent: centiToPercentDecimal(yieldCenti),
    minYieldPercentAtEvaluation: standard.minYieldPercent, maxYieldPercentAtEvaluation: standard.maxYieldPercent,
  }).returning();
  return deviation;
}

export async function listYieldDeviations(tx: Executor, actor: Identity, query: { branchId?: string | null; unreviewedOnly?: boolean } = {}) {
  const scope = branchScope(actor, query.branchId);
  const rows = await tx.select({
    deviation: cuttingYieldDeviations, production: actualCuttingProductions, itemName: menuItems.name,
  }).from(cuttingYieldDeviations)
    .innerJoin(actualCuttingProductions, eq(actualCuttingProductions.id, cuttingYieldDeviations.cuttingProductionId))
    .innerJoin(menuItems, eq(menuItems.id, actualCuttingProductions.menuItemId))
    .where(scope ? eq(actualCuttingProductions.branchId, scope) : undefined)
    .orderBy(cuttingYieldDeviations.createdAt);
  return rows
    .filter((row) => !query.unreviewedOnly || row.deviation.reviewedAt === null)
    .map((row) => ({ ...row.deviation, menuItemName: row.itemName, branchId: row.production.branchId, outputQty: row.production.outputQty, outputUnitAtSubmission: row.production.outputUnitAtSubmission }));
}

export async function reviewYieldDeviation(tx: Executor, actor: Identity, id: string, raw: Record<string, unknown>) {
  assertOwner(actor);
  if (typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 1000) throw new HttpError(400, "A non-empty reason is required to review a yield deviation");
  const [existing] = await tx.select().from(cuttingYieldDeviations).where(eq(cuttingYieldDeviations.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "Deviation not found");
  if (existing.reviewedAt) {
    if (existing.reviewedById !== actor.id || existing.reviewReason !== raw.reason) throw new HttpError(409, "Deviation already reviewed with a different outcome");
    return existing;
  }
  const [updated] = await tx.update(cuttingYieldDeviations).set({ reviewedById: actor.id, reviewedAt: new Date(), reviewReason: raw.reason })
    .where(and(eq(cuttingYieldDeviations.id, id), isNull(cuttingYieldDeviations.reviewedAt))).returning();
  if (!updated) throw new HttpError(409, "Deviation was reviewed concurrently; reload and retry");
  return updated;
}
