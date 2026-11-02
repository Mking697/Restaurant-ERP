import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { inventoryStock, stockBatches } from "../../db/schema/inventory";
import { rawMaterials } from "../../db/schema/menu";
import { indents, indentLines, grnLines, grns, purchaseOrderLines, purchaseOrders } from "../../db/schema/purchase";
import { internalRequisitionLines, internalRequisitions } from "../../db/schema/requisitions";
import { reorderSuggestions } from "../../db/schema/stock-review";
import { stockTransfers, warehouses } from "../../db/schema/warehouses";
import { warehouseStock } from "../../db/schema/warehouse-stock";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { decimal, quantity } from "./production-quantity";
import { allocateSupply, computeInventoryPosition, computeSuggestedQty, supplyPositionFingerprint } from "./reorder-policy";
import { businessDateString } from "./business-calendar";
import { batchDisposition } from "./batch-policy";

export interface SupplyPosition {
  branchId: string;
  rawMaterialId: string;
  name: string;
  unit: string;
  maxStock: string;
  minStock: string;
  usable: string;
  requisitionOutstanding: string;
  transferInTransit: string;
  externalPoOutstanding: string;
  qualityPending: string;
  pendingRequests: string;
  conversionEpoch: string;
  inventoryPosition: string;
  internalAvailable: string | null;
  internalAvailabilityReason: string;
}

async function sumLinkedDispatch(tx: Executor, lineId: string) {
  const [row] = await tx.select({ total: sql<string>`coalesce(sum(${stockTransfers.qtyDispatched}), 0)` }).from(stockTransfers).where(eq(stockTransfers.requisitionLineId, lineId));
  return quantity(row?.total ?? "0", true);
}

async function branchInbound(tx: Executor, branchId: string, rawMaterialId: string) {
  const reqRows = await tx.select({ lineId: internalRequisitionLines.id, approved: internalRequisitionLines.qtyApproved, requested: internalRequisitionLines.qtyRequested, status: internalRequisitionLines.status })
    .from(internalRequisitionLines).innerJoin(internalRequisitions, eq(internalRequisitions.id, internalRequisitionLines.requisitionId))
    .where(and(eq(internalRequisitions.branchId, branchId), eq(internalRequisitionLines.rawMaterialId, rawMaterialId), inArray(internalRequisitions.status, ["SUBMITTED", "APPROVED"]), inArray(internalRequisitionLines.status, ["PENDING", "APPROVED"])));
  let requisitionOutstanding = 0n;
  let pendingRequests = 0n;
  for (const row of reqRows) {
    const outstanding = quantity(row.status === "PENDING" ? row.requested : row.approved ?? "0", true) - await sumLinkedDispatch(tx, row.lineId);
    if (outstanding > 0n) {
      if (row.status === "PENDING") pendingRequests += outstanding;
      else requisitionOutstanding += outstanding;
    }
  }
  // Suggestion-created drafts reserve demand until rejected or represented by
  // a real PO. Read current line quantities so human edits release the delta.
  const drafts = await tx.select({ qty: indentLines.qty }).from(indentLines)
    .innerJoin(indents, eq(indents.id, indentLines.indentId))
    .innerJoin(reorderSuggestions, eq(reorderSuggestions.externalIndentId, indents.id))
    .where(and(eq(indents.branchId, branchId), eq(indentLines.rawMaterialId, rawMaterialId), inArray(indents.status, ["DRAFT", "PENDING_APPROVAL", "APPROVED"]), sql`not exists (select 1 from ${purchaseOrders} where ${purchaseOrders.indentId} = ${indents.id})`));
  for (const draft of drafts) pendingRequests += quantity(draft.qty, true);
  const [transit] = await tx.select({ total: sql<string>`coalesce(sum(${stockTransfers.qtyDispatched}), 0)` }).from(stockTransfers)
    .innerJoin(warehouses, eq(warehouses.id, stockTransfers.toWarehouseId))
    .where(and(eq(warehouses.branchId, branchId), eq(stockTransfers.rawMaterialId, rawMaterialId), eq(stockTransfers.status, "DISPATCHED")));
  // Aggregate item lines per PO before subtracting its own receipts. A closed
  // historical PO must never consume a different open PO's outstanding supply.
  const ordered = await tx.select({ poId: purchaseOrders.id, total: sql<string>`sum(${purchaseOrderLines.qty})` }).from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.poId))
    .where(and(eq(purchaseOrders.branchId, branchId), eq(purchaseOrders.isGeneralPurchase, false), eq(purchaseOrderLines.rawMaterialId, rawMaterialId), inArray(purchaseOrders.status, ["CREATED", "SENT", "DISPATCHED", "PARTIALLY_RECEIVED"])))
    .groupBy(purchaseOrders.id);
  let externalPoOutstanding = 0n;
  for (const order of ordered) {
    const [received] = await tx.select({ total: sql<string>`coalesce(sum(${grnLines.qtyReceived}), 0)` }).from(grnLines)
      .innerJoin(grns, eq(grns.id, grnLines.grnId))
      .where(and(eq(grns.poId, order.poId), eq(grnLines.rawMaterialId, rawMaterialId)));
    const remaining = quantity(order.total, true) - quantity(received?.total ?? "0", true);
    if (remaining > 0n) externalPoOutstanding += remaining;
  }
  const [pending] = await tx.select({ total: sql<string>`coalesce(sum(${grnLines.qtyReceived}), 0)` }).from(grnLines)
    .innerJoin(grns, eq(grns.id, grnLines.grnId))
    .where(and(eq(grns.branchId, branchId), eq(grnLines.rawMaterialId, rawMaterialId), eq(grns.qualityResult, "PENDING")));
  return {
    requisitionOutstanding,
    pendingRequests,
    transferInTransit: quantity(transit?.total ?? "0", true),
    externalPoOutstanding: externalPoOutstanding > 0n ? externalPoOutstanding : 0n,
    qualityPending: quantity(pending?.total ?? "0", true),
  };
}

async function internalAvailability(tx: Executor, rawMaterialId: string, now = new Date()): Promise<{ qty: bigint | null; reason: string }> {
  const central = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.type, "CENTRAL"));
  if (!central.length) return { qty: null, reason: "No central warehouse is configured, so internal availability cannot be determined safely." };
  const today = businessDateString(now);
  let provenStock = 0n;
  for (const warehouse of central) {
    const batches = await tx.select().from(stockBatches).where(and(eq(stockBatches.warehouseId, warehouse.id), eq(stockBatches.rawMaterialId, rawMaterialId)));
    const [balance] = await tx.select({ qty: warehouseStock.qtyOnHand }).from(warehouseStock).where(and(eq(warehouseStock.warehouseId, warehouse.id), eq(warehouseStock.rawMaterialId, rawMaterialId))).limit(1);
    const batchTotal = batches.reduce((sum, batch) => sum + quantity(batch.qtyRemaining, true), 0n);
    if (batchTotal !== quantity(balance?.qty ?? "0", true)) return { qty: null, reason: "Central batch balance does not reconcile with on-hand stock. Owner reconciliation is required." };
    provenStock += batches.filter(batch => !batchDisposition(batch, today).held).reduce((sum, batch) => sum + quantity(batch.qtyRemaining, true), 0n);
  }
  const active = await tx.select({ lineId: internalRequisitionLines.id, requested: internalRequisitionLines.qtyRequested, approved: internalRequisitionLines.qtyApproved, lineStatus: internalRequisitionLines.status, requisitionStatus: internalRequisitions.status })
    .from(internalRequisitionLines).innerJoin(internalRequisitions, eq(internalRequisitions.id, internalRequisitionLines.requisitionId))
    .where(and(eq(internalRequisitionLines.rawMaterialId, rawMaterialId), inArray(internalRequisitions.status, ["SUBMITTED", "APPROVED"]), inArray(internalRequisitionLines.status, ["PENDING", "APPROVED"])));
  let committed = 0n;
  for (const row of active) {
    const target = quantity(row.lineStatus === "APPROVED" ? row.approved ?? "0" : row.requested, true);
    const remaining = target - await sumLinkedDispatch(tx, row.lineId);
    if (remaining > 0n) committed += remaining;
  }
  const available = provenStock - committed;
  return { qty: available > 0n ? available : 0n, reason: "" };
}

export async function loadSupplyPosition(tx: Executor, actor: Identity, branchId: string, rawMaterialId: string): Promise<SupplyPosition> {
  assertModule(actor, "INVENTORY");
  const scope = branchScope(actor, branchId);
  if (!scope) throw new HttpError(400, "Select one branch");
  const [row] = await tx.select({ rawMaterialId: inventoryStock.rawMaterialId, usable: inventoryStock.qtyOnHand, minStock: inventoryStock.minStockLevel, maxStock: inventoryStock.maxStockLevel, name: rawMaterials.name, unit: rawMaterials.unit })
    .from(inventoryStock).innerJoin(rawMaterials, eq(rawMaterials.id, inventoryStock.rawMaterialId))
    .where(and(eq(inventoryStock.branchId, scope), eq(inventoryStock.rawMaterialId, rawMaterialId))).limit(1);
  if (!row) throw new HttpError(404, "Inventory item not found");
  const batches = await tx.select().from(stockBatches).where(and(eq(stockBatches.branchId, scope), eq(stockBatches.rawMaterialId, rawMaterialId)));
  const today = businessDateString();
  const batchTotal = batches.reduce((sum, batch) => sum + quantity(batch.qtyRemaining, true), 0n);
  const usable = batches.filter(batch => !batchDisposition(batch, today).held).reduce((sum, batch) => sum + quantity(batch.qtyRemaining, true), 0n);
  const inbound = await branchInbound(tx, scope, rawMaterialId);
  const central = await internalAvailability(tx, rawMaterialId);
  // Converted identities survive cancellation/fulfillment. A later genuine
  // replenishment cycle may return to the same numeric position, not the old row.
  const [epoch] = await tx.select({ value: sql<string>`count(*)` }).from(reorderSuggestions).where(and(eq(reorderSuggestions.branchId, scope), eq(reorderSuggestions.rawMaterialId, rawMaterialId), sql`${reorderSuggestions.convertedAt} is not null`));
  const values = {
    usable: decimal(usable),
    requisitionOutstanding: decimal(inbound.requisitionOutstanding),
    transferInTransit: decimal(inbound.transferInTransit),
    externalPoOutstanding: decimal(inbound.externalPoOutstanding),
    qualityPending: decimal(inbound.qualityPending),
    pendingRequests: decimal(inbound.pendingRequests),
  };
  return {
    branchId: scope, rawMaterialId, name: row.name, unit: row.unit,
    maxStock: decimal(quantity(row.maxStock, true)), minStock: decimal(quantity(row.minStock, true)), ...values, conversionEpoch: String(epoch?.value ?? "0"),
    inventoryPosition: computeInventoryPosition(values),
    internalAvailable: batchTotal !== quantity(row.usable, true) || central.qty === null ? null : decimal(central.qty),
    internalAvailabilityReason: batchTotal !== quantity(row.usable, true) ? "Branch batch balance does not reconcile with on-hand stock. Owner reconciliation is required." : central.reason,
  };
}

export async function previewReorderSuggestions(tx: Executor, actor: Identity, branchId: string) {
  assertModule(actor, "INVENTORY");
  const scope = branchScope(actor, branchId);
  if (!scope) throw new HttpError(400, "Select one branch");
  const items = await tx.select({ rawMaterialId: inventoryStock.rawMaterialId }).from(inventoryStock).where(eq(inventoryStock.branchId, scope));
  const results = [];
  for (const item of items) {
    const position = await loadSupplyPosition(tx, actor, scope, item.rawMaterialId);
    const suggestedQty = computeSuggestedQty(position.maxStock, position.inventoryPosition, position.unit);
    if (quantity(position.maxStock, true) <= 0n || quantity(suggestedQty, true) <= 0n || quantity(position.inventoryPosition, true) >= quantity(position.minStock, true)) continue;
    if (position.internalAvailable === null) {
      results.push({ id: null, ...position, suggestedQty, internalQty: null, externalQty: null, convertible: false });
      continue;
    }
    const allocation = allocateSupply(suggestedQty, position.internalAvailable, position.unit);
    const fingerprint = supplyPositionFingerprint({
      branchId: scope, rawMaterialId: position.rawMaterialId, unit: position.unit, minStock: position.minStock, maxStock: position.maxStock,
      usable: position.usable, requisitionOutstanding: position.requisitionOutstanding, transferInTransit: position.transferInTransit,
      externalPoOutstanding: position.externalPoOutstanding, qualityPending: position.qualityPending, pendingRequests: position.pendingRequests, conversionEpoch: position.conversionEpoch, internalAvailable: position.internalAvailable,
    });
    let [saved] = await tx.select().from(reorderSuggestions).where(eq(reorderSuggestions.positionFingerprint, fingerprint)).limit(1);
    if (!saved) {
      const id = randomUUID();
      await tx.insert(reorderSuggestions).values({ id, branchId: scope, rawMaterialId: position.rawMaterialId, positionFingerprint: fingerprint, positionJson: position, unit: position.unit, suggestedQty, internalQty: allocation.internalQty, externalQty: allocation.externalQty, createdById: actor.id });
      [saved] = await tx.select().from(reorderSuggestions).where(eq(reorderSuggestions.id, id)).limit(1);
    }
    results.push({ ...saved, ...position, convertible: true });
  }
  return results;
}

export async function readReorderSuggestion(tx: Executor, actor: Identity, suggestionId: string) {
  assertModule(actor, "INVENTORY");
  const [suggestion] = await tx.select().from(reorderSuggestions).where(eq(reorderSuggestions.id, suggestionId)).limit(1);
  if (!suggestion) throw new HttpError(404, "Reorder suggestion not found");
  branchScope(actor, suggestion.branchId);
  return suggestion;
}

export async function convertReorderSuggestion(tx: Executor, actor: Identity, suggestionId: string, requestKey: string) {
  assertModule(actor, "INVENTORY");
  assertModule(actor, "PURCHASE_INDENT");
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{15,199}$/.test(requestKey)) throw new HttpError(400, "requestKey must be a unique UUID-like value");
  const [suggestion] = await tx.select().from(reorderSuggestions).where(eq(reorderSuggestions.id, suggestionId)).limit(1);
  if (!suggestion) throw new HttpError(404, "Reorder suggestion not found");
  branchScope(actor, suggestion.branchId);
  const [keyReplay] = await tx.select().from(reorderSuggestions).where(eq(reorderSuggestions.conversionRequestKey, requestKey)).limit(1);
  if (keyReplay) {
    if (keyReplay.id !== suggestionId || keyReplay.convertedById !== actor.id) throw new HttpError(409, "requestKey was already used for another suggestion or actor");
    return { suggestion: keyReplay, replayed: true };
  }
  if (suggestion.convertedAt) return { suggestion, replayed: true };
  const current = await loadSupplyPosition(tx, actor, suggestion.branchId, suggestion.rawMaterialId);
  if (current.internalAvailable === null) throw new HttpError(409, current.internalAvailabilityReason);
  const fingerprint = supplyPositionFingerprint({
    branchId: current.branchId, rawMaterialId: current.rawMaterialId, unit: current.unit, minStock: current.minStock, maxStock: current.maxStock,
    usable: current.usable, requisitionOutstanding: current.requisitionOutstanding, transferInTransit: current.transferInTransit,
    externalPoOutstanding: current.externalPoOutstanding, qualityPending: current.qualityPending, pendingRequests: current.pendingRequests, conversionEpoch: current.conversionEpoch, internalAvailable: current.internalAvailable,
  });
  if (fingerprint !== suggestion.positionFingerprint) throw new HttpError(409, "Suggestion is stale because the supply position changed. Refresh suggestions before converting.");
  const expectedSuggested = computeSuggestedQty(current.maxStock, current.inventoryPosition, current.unit);
  const allocation = allocateSupply(expectedSuggested, current.internalAvailable, current.unit);
  if (expectedSuggested !== suggestion.suggestedQty || allocation.internalQty !== suggestion.internalQty || allocation.externalQty !== suggestion.externalQty) throw new HttpError(409, "Suggestion quantities changed. Refresh suggestions before converting.");
  let internalRequisitionId: string | null = null;
  let externalIndentId: string | null = null;
  if (quantity(allocation.internalQty, true) > 0n) {
    internalRequisitionId = randomUUID();
    await tx.insert(internalRequisitions).values({ id: internalRequisitionId, branchId: suggestion.branchId, requestedById: actor.id, status: "SUBMITTED" });
    await tx.insert(internalRequisitionLines).values({ id: randomUUID(), requisitionId: internalRequisitionId, lineType: "RAW", rawMaterialId: suggestion.rawMaterialId, menuItemId: null, qtyRequested: allocation.internalQty, status: "PENDING" });
  }
  if (quantity(allocation.externalQty, true) > 0n) {
    externalIndentId = randomUUID();
    await tx.insert(indents).values({ id: externalIndentId, branchId: suggestion.branchId, raisedById: actor.id, status: "DRAFT" });
    await tx.insert(indentLines).values({ id: randomUUID(), indentId: externalIndentId, rawMaterialId: suggestion.rawMaterialId, qty: allocation.externalQty });
  }
  await tx.update(reorderSuggestions).set({ conversionRequestKey: requestKey, internalRequisitionId, externalIndentId, convertedById: actor.id, convertedAt: new Date() }).where(eq(reorderSuggestions.id, suggestion.id));
  const [saved] = await tx.select().from(reorderSuggestions).where(eq(reorderSuggestions.id, suggestion.id));
  return { suggestion: saved, replayed: false };
}
