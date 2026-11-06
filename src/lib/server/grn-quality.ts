import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { grns, grnLines, purchaseOrders } from "../../db/schema/purchase";
import { inventoryStock } from "../../db/schema/inventory";
import { rawMaterials } from "../../db/schema/menu";
import { branches } from "../../db/schema/platform";
import { users } from "../../db/schema/auth";
import { auditLog } from "../../db/schema/whatsapp";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { decimal, MAX_QUANTITY } from "./production-quantity";
import { lockRecipeStock } from "./production";
import { assertVendorReturnsRecorded, recordVendorReturns } from "./vendor-returns";
import { postPurchaseGrnJournal } from "./accounts-ledger";
import { postStockMovement } from "./stock-ledger";
import { creditBatch } from "./stock-batches";
import { parseBatchInput } from "./batch-policy";
import { parseQualityInput, persistedQuantity, qualityDecision, qualityReceiptId, qualityReceiptState, QUALITY_ACTION, sameQualityRequest, qualityOriginId, validQualityOrigin } from "./grn-quality-policy";
import { ensureGrnHoReviewSubject } from "./ho-stock-review";

export async function readGrns(tx: Executor, actor: Identity, query: { branchId?: string | null; status?: typeof grns.$inferSelect.status; id?: string } = {}) {
  assertModule(actor, "PURCHASE_ORDER");
  const scope = branchScope(actor, query.branchId);
  const rows = await tx.select({
    id: grns.id, poId: grns.poId, poNumber: purchaseOrders.poNumber,
    branchId: grns.branchId, branch: branches.name, isGeneralPurchase: purchaseOrders.isGeneralPurchase,
    status: grns.status, qualityResult: grns.qualityResult, qualityPhotoUrl: grns.qualityPhotoUrl, qualityNote: grns.qualityNote,
    receivedById: grns.receivedById, receivedBy: users.name, createdAt: grns.createdAt,
  }).from(grns)
    .innerJoin(purchaseOrders, and(eq(purchaseOrders.id, grns.poId), eq(purchaseOrders.branchId, grns.branchId)))
    .innerJoin(branches, eq(branches.id, grns.branchId)).innerJoin(users, eq(users.id, grns.receivedById))
    .where(and(scope ? eq(grns.branchId, scope) : undefined, query.status ? eq(grns.status, query.status) : undefined, query.id ? eq(grns.id, query.id) : undefined))
    .orderBy(desc(grns.createdAt), asc(grns.id)).limit(200);
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const lines = await tx.select({
    id: grnLines.id, grnId: grnLines.grnId, rawMaterialId: grnLines.rawMaterialId, name: rawMaterials.name,
    unit: rawMaterials.unit, itemDescription: grnLines.itemDescription,
    qtyOrdered: grnLines.qtyOrdered, qtyReceived: grnLines.qtyReceived, qtyFailed: grnLines.qtyFailed, rateOrdered: grnLines.rateOrdered,
  }).from(grnLines).leftJoin(rawMaterials, eq(rawMaterials.id, grnLines.rawMaterialId))
    .where(inArray(grnLines.grnId, ids)).orderBy(asc(grnLines.id));
  const receipts = await tx.select().from(auditLog).where(inArray(auditLog.id, ids.flatMap(id => [qualityReceiptId(id), qualityOriginId(id)])));
  const byReceipt = new Map(receipts.map(row => [row.id, row]));
  return rows.map(row => {
    const children = lines.filter(line => line.grnId === row.id).map(line => {
      const received = persistedQuantity(line.qtyReceived), failed = persistedQuantity(line.qtyFailed, true);
      if (failed > received) throw new HttpError(409, "Invalid saved failed quantity; reconciliation required");
      return { ...line, name: line.name ?? line.itemDescription, unit: line.unit ?? "", qtyAccepted: decimal(received - failed) };
    });
    const state = qualityReceiptState(row, children, byReceipt.get(qualityReceiptId(row.id)));
    const qualityReady = !state.qualityRecorded && row.qualityResult === "PENDING" && row.status === "PENDING" && children.length > 0 && children.every(line => persistedQuantity(line.qtyFailed, true) === 0n) && validQualityOrigin(row, byReceipt.get(qualityOriginId(row.id)));
    return { ...row, lines: children, ...state, qualityReady, reconciliationRequired: !state.qualityRecorded && !qualityReady };
  });
}

// Caller owns mutate()'s global lock and transaction. The immutable audit receipt
// is durable writer-election evidence: deleting it requires reconciliation, not a
// speculative second stock post. No new schema or automatic financial entry.
export async function recordGrnQuality(tx: Executor, actor: Identity, id: string, input: Record<string, unknown>) {
  assertModule(actor, "PURCHASE_ORDER");
  const request = parseQualityInput(input);
  const [grn] = await tx.select().from(grns).where(eq(grns.id, id)).limit(1);
  if (!grn) throw new HttpError(404, "GRN not found");
  branchScope(actor, grn.branchId);
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, grn.poId)).limit(1);
  if (!po || po.branchId !== grn.branchId) throw new HttpError(409, "GRN purchase branch mismatch; reconciliation required");
  if (!po.isGeneralPurchase) assertModule(actor, "INVENTORY");
  const lines = await tx.select().from(grnLines).where(eq(grnLines.grnId, id)).orderBy(asc(grnLines.id));
  const decision = qualityDecision(request, lines, po.isGeneralPurchase);
  const [receipt] = await tx.select().from(auditLog).where(eq(auditLog.id, qualityReceiptId(id))).limit(1);
  if (receipt) {
    const state = qualityReceiptState({ ...grn, isGeneralPurchase: po.isGeneralPurchase }, lines, receipt);
    if (!state.qualityRecorded) throw new HttpError(409, "Quality receipt inconsistent; reconciliation required");
    const previous = parseQualityInput((receipt.metadataJson as { request: Record<string, unknown> }).request);
    if (!sameQualityRequest(request, previous)) throw new HttpError(409, "Quality already finalized with a different decision");
    const returnsVersion = (receipt.metadataJson as { vendorReturnsVersion?: unknown }).vendorReturnsVersion;
    if (returnsVersion !== undefined) {
      if (returnsVersion !== 1 || request.result === "PASS") throw new HttpError(409, "Vendor claim version inconsistent; reconciliation required");
      await assertVendorReturnsRecorded(tx, actor, id);
    }
    const [saved] = await readGrns(tx, actor, { id });
    if (!saved?.qualityRecorded) throw new HttpError(409, "Quality readback inconsistent; reconciliation required");
    await ensureGrnHoReviewSubject(tx, id, actor.id);
    return { grn: saved, replayed: true };
  }
  const [origin] = await tx.select().from(auditLog).where(eq(auditLog.id, qualityOriginId(id))).limit(1);
  if (!validQualityOrigin(grn, origin)) throw new HttpError(409, "Legacy GRN has no verified unposted origin; reconciliation required");
  if (grn.qualityResult !== "PENDING" || grn.status !== "PENDING" || lines.some(line => persistedQuantity(line.qtyFailed, true) !== 0n)) throw new HttpError(409, "Existing quality state has no receipt; reconciliation required");
  const failedById = new Map(decision.failedLines.map(l => [l.id, persistedQuantity(l.qtyFailed, true)]));
  // Nov 2026 (Owner-requested): exact accepted-value accumulation for the
  // GRN-time purchase journal posting below — same bigint-scale discipline
  // as computeGeneralPurchaseValueTsh/computeCentralPurchaseValueTsh (qty
  // scale 3 x rate scale 2, summed before rounding once at the end).
  let acceptedValueNumerator = 0n;
  for (const line of lines) {
    const accepted = persistedQuantity(line.qtyReceived) - (failedById.get(line.id) ?? 0n);
    if (accepted <= 0n) continue;
    const [whole, fraction = ""] = line.rateOrdered.split(".");
    const rateCenti = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
    acceptedValueNumerator += accepted * rateCenti;
  }
  const acceptedValueCenti = (acceptedValueNumerator + 500n) / 1000n;
  const acceptedValueTsh = `${acceptedValueCenti / 100n}.${(acceptedValueCenti % 100n).toString().padStart(2, "0")}`;
  if (decision.credits.length) {
    await lockRecipeStock(tx, grn.branchId);
    const materialIds = [...new Set(lines.map(line => line.rawMaterialId!))];
    const materials = await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(inArray(rawMaterials.id, materialIds));
    if (materials.length !== materialIds.length) throw new HttpError(409, "GRN material missing; reconciliation required");
    for (const credit of decision.credits) {
      const existing = await tx.select().from(inventoryStock)
        .where(and(eq(inventoryStock.branchId, grn.branchId), eq(inventoryStock.rawMaterialId, credit.rawMaterialId))).orderBy(asc(inventoryStock.id)).for("update");
      if (existing.length > 1) throw new HttpError(409, "Duplicate raw stock rows; reconcile inventory first");
      const amount = persistedQuantity(credit.qty);
      if (existing.length) {
        if (persistedQuantity(existing[0].qtyOnHand, true) + amount > MAX_QUANTITY) throw new HttpError(409, "Inventory stock capacity exceeded");
        await tx.update(inventoryStock).set({ qtyOnHand: sql`${inventoryStock.qtyOnHand} + ${credit.qty}::numeric`, updatedAt: new Date() }).where(eq(inventoryStock.id, existing[0].id));
      } else {
        await tx.insert(inventoryStock).values({ id: randomUUID(), branchId: grn.branchId, rawMaterialId: credit.rawMaterialId, qtyOnHand: credit.qty, minStockLevel: "0", maxStockLevel: "0" });
      }
      // GAP-004 first slice: audited parallel ledger record of this real
      // accepted-stock credit, alongside (not instead of) the qtyOnHand
      // update above. See src/lib/server/stock-ledger.ts.
      await postStockMovement(tx, {
        branchId: grn.branchId, rawMaterialId: credit.rawMaterialId, qtyDelta: amount,
        movementType: "GRN_RECEIPT", sourceType: "GRN", sourceId: id, actorId: actor.id,
      });
    }
  }
  for (const line of decision.failedLines) await tx.update(grnLines).set({ qtyFailed: line.qtyFailed }).where(and(eq(grnLines.id, line.id), eq(grnLines.grnId, id)));
  // GAP-006: one batch row per accepted GRN LINE (not the aggregated-by-
  // material `decision.credits`, so two lines of the same material with
  // different expiry dates stay as separate lots). expiryDate is whatever
  // the submitter entered for that line in `request.lines` (nullable —
  // "no expiry tracked for this lot", treated as never-expiring).
  if (!po.isGeneralPurchase) {
    const batchesById = new Map(request.lines.map(l => [l.id, parseBatchInput(l as unknown as Record<string, unknown>, actor.role === "SUPER_ADMIN")]));
    for (const line of lines) {
      if (!line.rawMaterialId) continue;
      const accepted = persistedQuantity(line.qtyReceived) - (failedById.get(line.id) ?? 0n);
      const batch = batchesById.get(line.id)!;
      if (accepted > 0n) await creditBatch(tx, grn.branchId, line.rawMaterialId, decimal(accepted), batch.expiryDate, line.id, { actorId: actor.id, sourceType: "GRN", sourceId: id }, batch, line.rateOrdered);
    }
  }
  await tx.update(grns).set({ qualityResult: request.result, status: request.result === "FAIL" ? "QUALITY_HOLD" : "APPROVED", qualityNote: request.note, qualityPhotoUrl: request.photoUrl }).where(eq(grns.id, id));
  await tx.insert(auditLog).values({ id: qualityReceiptId(id), userId: actor.id, action: QUALITY_ACTION, entityType: "GRN", entityId: id, metadataJson: { version: 1, branchId: grn.branchId, request, credits: decision.credits, ...(request.result !== "PASS" ? { vendorReturnsVersion: 1 } : {}) } });
  await postPurchaseGrnJournal(tx, actor, { id, branchId: grn.branchId }, acceptedValueTsh);
  if (request.result !== "PASS") await recordVendorReturns(tx, actor, id, {});
  await ensureGrnHoReviewSubject(tx, id, actor.id);
  const [saved] = await readGrns(tx, actor, { id });
  if (!saved?.qualityRecorded) throw new HttpError(409, "Quality readback inconsistent; transaction rolled back");
  return { grn: saved, replayed: false };
}
