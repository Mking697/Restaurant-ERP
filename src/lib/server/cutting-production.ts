import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { menuItems, rawMaterials } from "../../db/schema/menu";
import { inventoryStock } from "../../db/schema/inventory";
import { semiFgStock } from "../../db/schema/production";
import { actualCuttingProductions, type CuttingInputLine } from "../../db/schema/cutting-production";
import type { Executor } from "./auth";
import { HttpError } from "./permissions";
import { decimal, MAX_QUANTITY, quantity } from "./production-quantity";
import { assertProductionItem } from "./production-policy";
import { postStockMovement } from "./stock-ledger";
import { allocateConsume } from "./stock-batches";
import { readBusinessPolicy } from "./business-policy";
import { lockRecipeStock } from "./production";
import { evaluateYieldDeviation } from "./yield-standards";

// GAP-009. See src/db/schema/cutting-production.ts for the full design
// note. "Actual Cutting" is a separate production path from the existing
// Fixed-BOM src/lib/server/production.ts (produceSemiFg) — chosen per
// production EVENT by the operator, not a per-item setting.

export interface CuttingInput {
  menuItemId: string;
  inputs: { rawMaterialId: string; qtyKg: string }[];
  outputQty: string;
  outputMassKg?: string; // required when the output unit isn't already kg
  wasteQtyKg: string;
  idempotencyKey: string;
}

function identifier(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max) throw new HttpError(400, `Invalid ${field}`);
  return value;
}
function unsignedDecimal(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{1,9}(\.\d{1,3})?$/.test(value)) throw new HttpError(400, `Invalid ${field} (decimal string, up to 3 decimal places)`);
  return value;
}

// GAP-010 money helpers. unitCostTsh comes out of Postgres numeric(12,4) as
// a fixed-point string ("3500.0000"); parsed here into a bigint scaled by
// 10^4 so every multiply/sum below is exact integer arithmetic, never a
// float. divRoundHalfUp is the one place rounding happens, used ONLY at the
// final aggregate step (never per input line) per the Owner's "money
// rounding is exact" rule — summing already-rounded per-line values first
// would let rounding error compound across many small input lines.
function rateMicro(rate: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(rate);
  if (!m) throw new HttpError(409, "Invalid stored batch unit cost; reconciliation required");
  const [, sign, whole, frac = ""] = m;
  const fixed = (frac + "0000").slice(0, 4);
  const value = BigInt(whole) * 10000n + BigInt(fixed);
  return sign === "-" ? -value : value;
}
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}
function centiToDecimal(centi: bigint): string {
  const neg = centi < 0n;
  const abs = neg ? -centi : centi;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export function parseCuttingInput(input: Record<string, unknown>): CuttingInput {
  if (Object.keys(input).some((key) => !["menuItemId", "inputs", "outputQty", "outputMassKg", "wasteQtyKg", "idempotencyKey"].includes(key))) throw new HttpError(400, "Unexpected field");
  const menuItemId = identifier(input.menuItemId, "menuItemId");
  if (!Array.isArray(input.inputs) || input.inputs.length < 1 || input.inputs.length > 20) throw new HttpError(400, "Supply 1-20 input raw materials");
  const seen = new Set<string>();
  const inputs = input.inputs.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid input line");
    const line = value as Record<string, unknown>;
    if (Object.keys(line).some((key) => !["rawMaterialId", "qtyKg"].includes(key))) throw new HttpError(400, "Unexpected input field");
    const rawMaterialId = identifier(line.rawMaterialId, "rawMaterialId");
    if (seen.has(rawMaterialId)) throw new HttpError(400, "Duplicate input raw material");
    seen.add(rawMaterialId);
    return { rawMaterialId, qtyKg: unsignedDecimal(line.qtyKg, "input qtyKg") };
  });
  const outputQty = unsignedDecimal(input.outputQty, "outputQty");
  const outputMassKg = input.outputMassKg === undefined ? undefined : unsignedDecimal(input.outputMassKg, "outputMassKg");
  const wasteQtyKg = input.wasteQtyKg === undefined ? "0.000" : unsignedDecimal(input.wasteQtyKg, "wasteQtyKg");
  const idempotencyKey = identifier(input.idempotencyKey, "idempotencyKey", 128);
  return { menuItemId, inputs, outputQty, outputMassKg, wasteQtyKg, idempotencyKey };
}

export async function recordActualCutting(tx: Executor, actorId: string, branchId: string, raw: Record<string, unknown>) {
  const parsed = parseCuttingInput(raw);
  await lockRecipeStock(tx, branchId);

  const [existing] = await tx.select().from(actualCuttingProductions).where(and(eq(actualCuttingProductions.branchId, branchId), eq(actualCuttingProductions.idempotencyKey, parsed.idempotencyKey))).limit(1);
  if (existing) {
    const existingByMaterial = new Map((existing.inputs as CuttingInputLine[]).map((line) => [line.rawMaterialId, line.qtyKg]));
    const sameInputs = parsed.inputs.length === existingByMaterial.size && parsed.inputs.every((line) => existingByMaterial.get(line.rawMaterialId) === decimal(quantity(line.qtyKg, true)));
    if (existing.menuItemId !== parsed.menuItemId || existing.outputQty !== decimal(quantity(parsed.outputQty)) || existing.wasteQtyKg !== decimal(quantity(parsed.wasteQtyKg, true)) || !sameInputs) throw new HttpError(409, "Idempotency key already used with different cutting input");
    return { production: existing, replayed: true };
  }

  const [item] = await tx.select().from(menuItems).where(eq(menuItems.id, parsed.menuItemId)).limit(1);
  assertProductionItem(item, branchId);

  const rawIds = parsed.inputs.map((line) => line.rawMaterialId);
  const materials = await tx.select().from(rawMaterials).where(inArray(rawMaterials.id, rawIds));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  for (const line of parsed.inputs) {
    const material = materialById.get(line.rawMaterialId);
    if (!material) throw new HttpError(400, `Raw material not found: ${line.rawMaterialId}`);
    // Scope restriction (Owner decision): Actual Cutting inputs must be a
    // real mass unit so the conservation check below is never comparing
    // incompatible units (e.g. litres against kilograms).
    if (material.unit !== "kg") throw new HttpError(400, `Actual Cutting requires kg-unit raw materials; ${material.name} is in ${material.unit}`);
    quantity(line.qtyKg, true);
  }

  const inputTotalKg = parsed.inputs.reduce((sum, line) => sum + quantity(line.qtyKg, true), 0n);
  if (inputTotalKg === 0n) throw new HttpError(400, "Total input must be greater than zero");

  const outputUnit = item.outputUnit;
  const outputQty = quantity(parsed.outputQty);
  if (outputUnit === "pcs" && outputQty % 1000n !== 0n) throw new HttpError(400, "Output in pcs must be a whole number of pieces");
  let outputMassKg: bigint;
  if (outputUnit === "kg") {
    outputMassKg = outputQty;
  } else {
    if (parsed.outputMassKg === undefined) throw new HttpError(400, `outputMassKg is required when the output unit (${outputUnit}) is not already kg`);
    outputMassKg = quantity(parsed.outputMassKg, true);
  }
  const wasteQtyKg = quantity(parsed.wasteQtyKg, true);

  // Hard physical rule, no tolerance: cutting cannot create mass.
  if (outputMassKg + wasteQtyKg > inputTotalKg) throw new HttpError(409, `Output mass (${decimal(outputMassKg)}) plus waste (${decimal(wasteQtyKg)}) cannot exceed total input (${decimal(inputTotalKg)})`);

  const policy = await readBusinessPolicy();
  if (policy.costYieldTolerancePercent === null) throw new HttpError(409, "Owner must configure the cost/yield variance tolerance before Actual Cutting can be used");
  const tolerancePercent = policy.costYieldTolerancePercent;
  const unaccounted = inputTotalKg - outputMassKg - wasteQtyKg; // >= 0, enforced above
  const unaccountedPercentMillis = (unaccounted * 100_000n) / inputTotalKg; // percent, scaled x1000 (3dp), same scale as quantity()
  const unaccountedPercent = decimal(unaccountedPercentMillis);
  const toleranceMillis = quantity(tolerancePercent.includes(".") ? tolerancePercent : `${tolerancePercent}.000`, true);
  if (unaccountedPercentMillis > toleranceMillis) {
    throw new HttpError(409, `Unaccounted loss ${unaccountedPercent}% exceeds the Owner's configured tolerance ${tolerancePercent}%`);
  }

  // Debit each raw-material input — same hard-blocked FEFO consumption as
  // every other real RAW draw (production.ts's deductStock, GAP-006).
  // GAP-010: also accumulate the EXACT real value drawn, failing closed
  // (409) the moment ANY lot drawn from has no recorded unitCostTsh —
  // never silently treating an unknown-cost lot as free.
  const rawRows = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.branchId, branchId), inArray(inventoryStock.rawMaterialId, rawIds))).for("update");
  const stockById = new Map(rawRows.map((row) => [row.rawMaterialId, row]));
  const id = randomUUID();
  let totalValueScaled = 0n; // scaled x10^7 (rate x10^4 * qtyMilli x10^3)
  for (const line of parsed.inputs) {
    const stockRow = stockById.get(line.rawMaterialId);
    const amount = quantity(line.qtyKg, true);
    if (!stockRow || quantity(stockRow.qtyOnHand, true) < amount) throw new HttpError(409, `Insufficient raw stock: ${line.rawMaterialId} needs ${line.qtyKg}, has ${stockRow?.qtyOnHand ?? "0.000"}`);
    const allocations = await allocateConsume(tx, branchId, line.rawMaterialId, line.qtyKg, { allowExpired: false, actorId, sourceType: "ACTUAL_CUTTING", sourceId: id });
    for (const allocation of allocations) {
      if (allocation.unitCostTsh === null) throw new HttpError(409, `Unknown cost for ${materialById.get(line.rawMaterialId)!.name} lot ${allocation.batchNo}; Owner must record its real cost (via GRN or batch reconciliation) before Actual Cutting can cost this production`);
      totalValueScaled += rateMicro(allocation.unitCostTsh) * quantity(allocation.qty, true);
    }
    const changed = await tx.update(inventoryStock).set({ qtyOnHand: sql`${inventoryStock.qtyOnHand} - ${line.qtyKg}::numeric`, updatedAt: new Date() }).where(and(eq(inventoryStock.id, stockRow.id), eq(inventoryStock.branchId, branchId))).returning({ id: inventoryStock.id });
    if (!changed.length) throw new HttpError(409, "Raw stock changed; retry");
    await postStockMovement(tx, { branchId, rawMaterialId: line.rawMaterialId, qtyDelta: -amount, movementType: "PRODUCTION_CONSUME", sourceType: "ACTUAL_CUTTING", sourceId: id, actorId });
  }
  // Round ONCE here (money, 2dp) — never per input line.
  const inputTotalValueCenti = divRoundHalfUp(totalValueScaled, 100000n);
  const costPerOutputUnitCenti = divRoundHalfUp(inputTotalValueCenti * 1000n, outputQty);
  const inputTotalValueTsh = centiToDecimal(inputTotalValueCenti);
  const costPerOutputUnitTsh = centiToDecimal(costPerOutputUnitCenti);

  // Credit the output Semi-FG item — same upsert/capacity pattern as
  // produceSemiFg (production.ts).
  await tx.insert(semiFgStock).values({ id: randomUUID(), branchId, menuItemId: item.id, qtyOnHand: "0.000" }).onConflictDoNothing({ target: [semiFgStock.branchId, semiFgStock.menuItemId] });
  const updated = await tx.update(semiFgStock).set({ qtyOnHand: sql`${semiFgStock.qtyOnHand} + ${decimal(outputQty)}::numeric`, updatedAt: new Date() })
    .where(and(eq(semiFgStock.branchId, branchId), eq(semiFgStock.menuItemId, item.id), lte(semiFgStock.qtyOnHand, decimal(MAX_QUANTITY - outputQty))))
    .returning({ qtyOnHand: semiFgStock.qtyOnHand });
  if (!updated.length) throw new HttpError(409, "Semi-FG stock capacity exceeded");
  await postStockMovement(tx, { branchId, menuItemId: item.id, qtyDelta: outputQty, movementType: "PRODUCTION_OUTPUT", sourceType: "ACTUAL_CUTTING", sourceId: id, actorId });

  const inputsSnapshot: CuttingInputLine[] = parsed.inputs.map((line) => ({ rawMaterialId: line.rawMaterialId, name: materialById.get(line.rawMaterialId)!.name, qtyKg: line.qtyKg }));
  const [production] = await tx.insert(actualCuttingProductions).values({
    id, branchId, menuItemId: item.id, inputs: inputsSnapshot, inputTotalKg: decimal(inputTotalKg),
    outputQty: decimal(outputQty), outputUnitAtSubmission: outputUnit, outputMassKg: decimal(outputMassKg), wasteQtyKg: decimal(wasteQtyKg),
    unaccountedLossPercent: unaccountedPercent, tolerancePercentAtSubmission: tolerancePercent,
    inputTotalValueTsh, costPerOutputUnitTsh,
    idempotencyKey: parsed.idempotencyKey, producedById: actorId,
  }).returning();
  // GAP-011: SOFT flag only — never blocks. Evaluated against whatever
  // standard is current for this item right now; a missing standard means
  // nothing is evaluated (no deviation possible), never a fabricated band.
  const deviation = await evaluateYieldDeviation(tx, production.id, item.id, outputMassKg, inputTotalKg);
  return { production, deviation, replayed: false };
}
