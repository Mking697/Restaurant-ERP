import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { inventoryStock } from "../../db/schema/inventory";
import { stockCountLines, stockCounts } from "../../db/schema/stock-count";
import { rawMaterials } from "../../db/schema/menu";
import type { Executor } from "./auth";
import { HttpError, type Identity, branchScope } from "./permissions";
import { numeric } from "./http";
import { allowedFields } from "./purchase";
import { decimal, MAX_QUANTITY, quantity } from "./production-quantity";
import { postStockMovement } from "./stock-ledger";
import { allocateConsume, creditBatch } from "./stock-batches";

// GAP-007. See src/db/schema/stock-count.ts for the full lifecycle note.
// Only BRANCH_MANAGER/SUPER_ADMIN may approve or reject a count (the review
// step is explicitly a manager/owner action, not something the counting
// staff role itself can do) — AND the approver can never be the same user
// who submitted it, checked below regardless of role.
export function assertCountReviewer(actor: Identity) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "BRANCH_MANAGER") throw new HttpError(403, "Only a Branch Manager or Owner can review a stock count");
}

export async function startStockCount(tx: Executor, actor: Identity, branchId: string, rawMaterialIds: string[]) {
  allowedFields({ rawMaterialIds }, ["rawMaterialIds"]);
  if (!Array.isArray(rawMaterialIds) || rawMaterialIds.length < 1 || rawMaterialIds.length > 200) throw new HttpError(400, "Supply 1-200 raw material IDs to count");
  const ids = [...new Set(rawMaterialIds)];
  if (ids.length !== rawMaterialIds.length) throw new HttpError(400, "Duplicate raw material ID");
  const materials = await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(inArray(rawMaterials.id, ids));
  if (materials.length !== ids.length) throw new HttpError(400, "One or more raw materials not found");

  const stockRows = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.branchId, branchId), inArray(inventoryStock.rawMaterialId, ids)));
  const byMaterial = new Map(stockRows.map((row) => [row.rawMaterialId, row.qtyOnHand]));

  const countId = randomUUID();
  await tx.insert(stockCounts).values({ id: countId, branchId, startedById: actor.id });
  for (const rawMaterialId of ids) {
    // No inventory_stock row yet for this material at this branch means the
    // system's real expected balance is zero — never fabricated, just the
    // honest absence-of-stock case (same convention used elsewhere in this
    // project for an unopened branch+material pair).
    await tx.insert(stockCountLines).values({ id: randomUUID(), countId, rawMaterialId, expectedQty: byMaterial.get(rawMaterialId) ?? "0.000" });
  }
  return loadCount(tx, countId);
}

export interface SubmitCountLineInput { rawMaterialId: string; physicalQty: string; }
export function parseSubmitCountInput(input: Record<string, unknown>): SubmitCountLineInput[] {
  allowedFields(input, ["lines"]);
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200) throw new HttpError(400, "Supply 1-200 count lines");
  const ids = new Set<string>();
  return input.lines.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid count line");
    const line = value as Record<string, unknown>;
    allowedFields(line, ["rawMaterialId", "physicalQty"]);
    const rawMaterialId = typeof line.rawMaterialId === "string" && line.rawMaterialId ? line.rawMaterialId : (() => { throw new HttpError(400, "Invalid rawMaterialId"); })();
    if (ids.has(rawMaterialId)) throw new HttpError(400, "Duplicate count line for one raw material");
    ids.add(rawMaterialId);
    const physicalQty = numeric(line.physicalQty, "physicalQty"); // unsigned, 0 allowed (a real zero count)
    quantity(physicalQty, true);
    return { rawMaterialId, physicalQty };
  });
}

export async function submitStockCount(tx: Executor, actor: Identity, countId: string, lines: SubmitCountLineInput[]) {
  const count = await loadCountForUpdate(tx, actor, countId);
  if (count.status !== "DRAFT") throw new HttpError(409, "Only a DRAFT count can be submitted");
  const existingLines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, countId));
  const byMaterial = new Map(existingLines.map((row) => [row.rawMaterialId, row]));
  if (lines.length !== existingLines.length) throw new HttpError(400, "Submission must cover every line started in this count, no more and no fewer");
  for (const line of lines) {
    const existing = byMaterial.get(line.rawMaterialId);
    if (!existing) throw new HttpError(400, "Unknown count line for this count");
    await tx.update(stockCountLines).set({ physicalQty: line.physicalQty }).where(eq(stockCountLines.id, existing.id));
  }
  await tx.update(stockCounts).set({ status: "SUBMITTED", submittedById: actor.id, submittedAt: new Date() }).where(eq(stockCounts.id, countId));
  return loadCount(tx, countId);
}

export async function approveStockCount(tx: Executor, actor: Identity, countId: string) {
  assertCountReviewer(actor);
  const count = await loadCountForUpdate(tx, actor, countId);
  if (count.status !== "SUBMITTED") throw new HttpError(409, "Only a SUBMITTED count can be approved");
  // Hard rule (Owner decision): no self-approval, regardless of role.
  if (count.submittedById === actor.id) throw new HttpError(403, "The user who submitted this count cannot also approve it");
  const branchId = count.branchId;

  const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, countId)).orderBy(asc(stockCountLines.id));
  for (const line of lines) {
    if (line.physicalQty === null) throw new HttpError(409, "A submitted count must have a physical quantity on every line");
    // The delta is frozen against the cutoff snapshot (expectedQty), but
    // applied to whatever the CURRENT live balance is right now — never an
    // overwrite — so a GRN/sale/transfer that landed between cutoff and
    // this approval is never silently erased. See the acceptance scenario
    // in gaps.md: cutoff 5, physical 0, a +3 receipt lands before approval
    // -> the approved -5 delta leaves the current balance at 3, not 0.
    const delta = quantity(line.physicalQty, true) - quantity(line.expectedQty, true);
    if (delta === 0n) continue;

    const rows = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.branchId, branchId), eq(inventoryStock.rawMaterialId, line.rawMaterialId))).limit(2).for("update");
    if (rows.length > 1) throw new HttpError(409, "Duplicate raw stock rows; reconcile inventory first");
    const [existing] = rows;
    const current = existing ? quantity(existing.qtyOnHand, true) : 0n;
    const updated = current + delta;
    if (updated < 0n) throw new HttpError(409, `Approving this count would take ${line.rawMaterialId} negative (current ${existing?.qtyOnHand ?? "0.000"}, count delta ${decimal(delta < 0n ? -delta : delta)}${delta < 0n ? " shortage" : " surplus"}); reconcile stock before approving`);
    if (updated > MAX_QUANTITY) throw new HttpError(409, "Approving this count would exceed stock capacity");

    if (existing) await tx.update(inventoryStock).set({ qtyOnHand: decimal(updated), updatedAt: new Date() }).where(eq(inventoryStock.id, existing.id));
    else await tx.insert(inventoryStock).values({ id: randomUUID(), branchId, rawMaterialId: line.rawMaterialId, qtyOnHand: decimal(updated), minStockLevel: "0", maxStockLevel: "0" });

    // GAP-006 invariant: every RAW writer must keep stockBatches in sync
    // with inventory_stock. A shortfall is drawn FEFO across ALL batches
    // (allowExpired: true — this is the audited REAL reduction already,
    // not a prevented consumption, so the hard-block doesn't apply). A
    // surplus cannot be assigned a real lot the count doesn't know about —
    // it becomes one new UNKNOWN/held batch, same as nightVarianceEntries.
    const source = { actorId: actor.id, sourceType: "STOCK_COUNT", sourceId: line.id };
    if (delta < 0n) await allocateConsume(tx, branchId, line.rawMaterialId, decimal(-delta), { allowExpired: true, ...source });
    else await creditBatch(tx, branchId, line.rawMaterialId, decimal(delta), null, "", source);

    await postStockMovement(tx, { branchId, rawMaterialId: line.rawMaterialId, qtyDelta: delta, movementType: "PHYSICAL_COUNT_ADJUST", sourceType: "STOCK_COUNT", sourceId: line.id, actorId: actor.id });
  }

  await tx.update(stockCounts).set({ status: "APPROVED", approvedById: actor.id, approvedAt: new Date() }).where(eq(stockCounts.id, countId));
  return loadCount(tx, countId);
}

export async function rejectStockCount(tx: Executor, actor: Identity, countId: string, reviewNote: string) {
  assertCountReviewer(actor);
  const count = await loadCountForUpdate(tx, actor, countId);
  if (count.status !== "SUBMITTED") throw new HttpError(409, "Only a SUBMITTED count can be rejected");
  if (count.submittedById === actor.id) throw new HttpError(403, "The user who submitted this count cannot also reject/review it");
  if (reviewNote.trim().length < 3) throw new HttpError(400, "A rejection reason is required");
  await tx.update(stockCounts).set({ status: "REJECTED", approvedById: actor.id, approvedAt: new Date(), reviewNote: reviewNote.trim().slice(0, 1000) }).where(eq(stockCounts.id, countId));
  return loadCount(tx, countId);
}

async function loadCountForUpdate(tx: Executor, actor: Identity, countId: string) {
  const [count] = await tx.select().from(stockCounts).where(eq(stockCounts.id, countId)).limit(1).for("update");
  if (!count) throw new HttpError(404, "Stock count not found");
  branchScope(actor, count.branchId);
  return count;
}

export async function loadCount(tx: Executor, countId: string) {
  const [count] = await tx.select().from(stockCounts).where(eq(stockCounts.id, countId));
  const lines = await tx
    .select({ id: stockCountLines.id, rawMaterialId: stockCountLines.rawMaterialId, name: rawMaterials.name, unit: rawMaterials.unit, expectedQty: stockCountLines.expectedQty, physicalQty: stockCountLines.physicalQty })
    .from(stockCountLines)
    .innerJoin(rawMaterials, eq(rawMaterials.id, stockCountLines.rawMaterialId))
    .where(eq(stockCountLines.countId, countId))
    .orderBy(asc(stockCountLines.id));
  return { ...count, lines };
}
