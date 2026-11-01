import { randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { stockBatches } from "../../db/schema/inventory";
import { batchMovements } from "../../db/schema/batch-audit";
import type { Executor } from "./auth";
import { HttpError } from "./permissions";
import { decimal, quantity } from "./production-quantity";
import { businessDateString } from "./business-calendar";
import { batchDisposition, calendarDate, type BatchInput } from "./batch-policy";

export type BatchLocation = { branchId: string; warehouseId?: never } | { warehouseId: string; branchId?: never };
export interface BatchSource { actorId: string; sourceType: string; sourceId: string; evidence?: string; }
export function locationCondition(location: BatchLocation) {
  if (!!location.branchId === !!location.warehouseId) throw new HttpError(400, "Supply branchId XOR warehouseId");
  return location.branchId ? eq(stockBatches.branchId, location.branchId) : eq(stockBatches.warehouseId, location.warehouseId!);
}
export function isExpired(expiryDate: string | null, asOf = businessDateString()) { return expiryDate !== null && expiryDate < asOf; }
export async function batchMovement(tx: Executor, batchId: string, delta: bigint, source: BatchSource, metadata: unknown = {}) {
  if (!source.actorId || !source.sourceId || !source.sourceType) throw new HttpError(409, "Batch audit source is required");
  await tx.insert(batchMovements).values({ id: randomUUID(), batchId, qtyDelta: delta < 0n ? `-${decimal(-delta)}` : decimal(delta), actorId: source.actorId, sourceType: source.sourceType, sourceId: source.sourceId, evidence: source.evidence ?? "", metadata });
}
export async function creditLocatedBatch(tx: Executor, location: BatchLocation, rawMaterialId: string, qty: string, input: BatchInput, source: BatchSource, extra: { grnLineId?: string; originBatchId?: string | null; unitCostTsh?: string | null } = {}) {
  locationCondition(location);
  const amount = quantity(qty, true);
  if (amount === 0n) return null;
  calendarDate(input.expiryDate);
  if (input.expiryStatus === "NON_EXPIRING" && input.expiryDate || input.expiryStatus === "DATED" && !input.expiryDate) throw new HttpError(409, "Invalid batch expiry state");
  const id = randomUUID();
  await tx.insert(stockBatches).values({ id, branchId: location.branchId ?? null, warehouseId: location.warehouseId ?? null, rawMaterialId, batchNo: input.batchNo ?? id, qtyReceived: decimal(amount), qtyRemaining: decimal(amount), expiryDate: input.expiryDate, expiryStatus: input.expiryStatus, grnLineId: extra.grnLineId ?? "", originBatchId: extra.originBatchId ?? null, unitCostTsh: extra.unitCostTsh ?? null });
  await batchMovement(tx, id, amount, { ...source, evidence: input.evidence || source.evidence }, { expiryDate: input.expiryDate, expiryStatus: input.expiryStatus, originBatchId: extra.originBatchId ?? null });
  return id;
}
export async function creditBatch(tx: Executor, branchId: string, rawMaterialId: string, qty: string, expiryDate: string | null, grnLineId: string, source: BatchSource, input?: BatchInput, unitCostTsh?: string | null) {
  return creditLocatedBatch(tx, { branchId }, rawMaterialId, qty, input ?? { batchNo: null, expiryDate, expiryStatus: expiryDate ? "DATED" : "UNKNOWN", evidence: "" }, source, { grnLineId, unitCostTsh });
}
export interface BatchAllocation { batchId: string; qty: string; batchNo: string; expiryDate: string | null; expiryStatus: "UNKNOWN" | "DATED" | "NON_EXPIRING"; originBatchId: string; unitCostTsh: string | null; }
export async function allocateLocatedConsume(tx: Executor, location: BatchLocation, rawMaterialId: string, qty: string, opts: BatchSource & { allowExpired: boolean; expiredOnly?: boolean }): Promise<BatchAllocation[]> {
  const amount = quantity(qty, true);
  if (amount === 0n) return [];
  const today = businessDateString();
  const rows = await tx.select().from(stockBatches).where(and(locationCondition(location), eq(stockBatches.rawMaterialId, rawMaterialId), gt(stockBatches.qtyRemaining, "0"))).orderBy(asc(stockBatches.expiryDate), asc(stockBatches.id)).for("update");
  const usable = rows.filter(row => opts.expiredOnly ? isExpired(row.expiryDate, today) : opts.allowExpired || !batchDisposition(row, today).held);
  const available = usable.reduce((sum, row) => sum + quantity(row.qtyRemaining, true), 0n);
  if (available < amount) throw new HttpError(409, `Insufficient ${opts.expiredOnly ? "EXPIRED" : opts.allowExpired ? "batch" : "NON-EXPIRED verified"} batch stock: available ${decimal(available)}, requested ${qty}; unknown/unbatched stock requires Owner reconciliation`);
  let remaining = amount;
  const allocations: BatchAllocation[] = [];
  for (const row of usable) {
    if (remaining === 0n) break;
    const available = quantity(row.qtyRemaining, true), take = available < remaining ? available : remaining;
    await tx.update(stockBatches).set({ qtyRemaining: decimal(available - take) }).where(eq(stockBatches.id, row.id));
    await batchMovement(tx, row.id, -take, opts);
    allocations.push({ batchId: row.id, qty: decimal(take), batchNo: row.batchNo, expiryDate: row.expiryDate, expiryStatus: batchDisposition(row, today).expiryStatus, originBatchId: row.originBatchId ?? row.id, unitCostTsh: row.unitCostTsh ?? null });
    remaining -= take;
  }
  return allocations;
}
export async function allocateConsume(tx: Executor, branchId: string, rawMaterialId: string, qty: string, opts: BatchSource & { allowExpired: boolean }) {
  return allocateLocatedConsume(tx, { branchId }, rawMaterialId, qty, opts);
}
export async function allocateExpiredConsume(tx: Executor, branchId: string, rawMaterialId: string, qty: string, source: BatchSource) {
  return allocateLocatedConsume(tx, { branchId }, rawMaterialId, qty, { ...source, allowExpired: true, expiredOnly: true });
}

