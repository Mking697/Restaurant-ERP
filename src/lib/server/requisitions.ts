import { randomUUID } from "node:crypto";
import { desc, eq, inArray, sum } from "drizzle-orm";
import { internalRequisitions, internalRequisitionLines } from "../../db/schema/requisitions";
import { stockTransfers } from "../../db/schema/warehouses";
import { semiFgTransfers } from "../../db/schema/semi-fg-transfers";
import { rawMaterials, menuItems } from "../../db/schema/menu";
import type { Executor } from "./auth";
import { assertModule, assertOwner, branchScope, HttpError, type Identity } from "./permissions";
import { decimal, quantity } from "./production-quantity";

// GAP-014. See src/db/schema/requisitions.ts for the full design note.
// Mixed RAW+PREPARED lines, Owner-only approval, fulfillment reuses the
// EXISTING raw stock-transfer and Semi-FG transfer dispatch/receive
// endpoints (never a duplicated transfer mechanism here).

interface RawLineInput { lineType: "RAW"; rawMaterialId: string; qtyRequested: string; }
interface PreparedLineInput { lineType: "PREPARED"; menuItemId: string; qtyRequested: string; }

function parseLine(value: unknown): RawLineInput | PreparedLineInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid requisition line");
  const line = value as Record<string, unknown>;
  if (line.lineType === "RAW") {
    if (typeof line.rawMaterialId !== "string" || !line.rawMaterialId) throw new HttpError(400, "RAW line requires rawMaterialId");
    const qty = quantity(line.qtyRequested, true);
    if (qty <= 0n) throw new HttpError(400, "qtyRequested must be positive");
    return { lineType: "RAW", rawMaterialId: line.rawMaterialId, qtyRequested: decimal(qty) };
  }
  if (line.lineType === "PREPARED") {
    if (typeof line.menuItemId !== "string" || !line.menuItemId) throw new HttpError(400, "PREPARED line requires menuItemId");
    const qty = quantity(line.qtyRequested, true);
    if (qty <= 0n) throw new HttpError(400, "qtyRequested must be positive");
    return { lineType: "PREPARED", menuItemId: line.menuItemId, qtyRequested: decimal(qty) };
  }
  throw new HttpError(400, "lineType must be RAW or PREPARED");
}

export async function submitRequisition(tx: Executor, actor: Identity, raw: Record<string, unknown>) {
  assertModule(actor, "INVENTORY");
  if (typeof raw.branchId !== "string" || !raw.branchId) throw new HttpError(400, "Invalid branchId");
  const branchId = branchScope(actor, raw.branchId);
  if (!branchId) throw new HttpError(400, "Select a branch");
  if (!Array.isArray(raw.lines) || raw.lines.length < 1 || raw.lines.length > 50) throw new HttpError(400, "Supply 1-50 requisition lines");
  const lines = raw.lines.map(parseLine);

  const rawIds = lines.filter((l): l is RawLineInput => l.lineType === "RAW").map((l) => l.rawMaterialId);
  if (rawIds.length) {
    const found = await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(inArray(rawMaterials.id, rawIds));
    if (found.length !== new Set(rawIds).size) throw new HttpError(400, "A requested raw material was not found");
  }
  const menuIds = lines.filter((l): l is PreparedLineInput => l.lineType === "PREPARED").map((l) => l.menuItemId);
  if (menuIds.length) {
    const found = await tx.select({ id: menuItems.id, isSemiFg: menuItems.isSemiFg, branchId: menuItems.branchId }).from(menuItems).where(inArray(menuItems.id, menuIds));
    if (found.length !== new Set(menuIds).size) throw new HttpError(400, "A requested Semi-FG item was not found");
    if (found.some((item) => !item.isSemiFg)) throw new HttpError(400, "A PREPARED line must reference a Semi-FG item");
    if (found.some((item) => item.branchId !== branchId)) throw new HttpError(400, "A PREPARED line's item must belong to the requesting branch (it is matched by name at fulfillment time, same as GAP-013)");
  }

  const id = randomUUID();
  await tx.insert(internalRequisitions).values({ id, branchId, requestedById: actor.id });
  for (const line of lines) {
    await tx.insert(internalRequisitionLines).values({
      id: randomUUID(), requisitionId: id, lineType: line.lineType,
      rawMaterialId: line.lineType === "RAW" ? line.rawMaterialId : null,
      menuItemId: line.lineType === "PREPARED" ? line.menuItemId : null,
      qtyRequested: line.qtyRequested,
    });
  }
  return loadRequisition(tx, id);
}

export async function approveRequisition(tx: Executor, actor: Identity, requisitionId: string, raw: Record<string, unknown>) {
  assertOwner(actor);
  const [requisition] = await tx.select().from(internalRequisitions).where(eq(internalRequisitions.id, requisitionId)).limit(1);
  if (!requisition) throw new HttpError(404, "Requisition not found");
  if (requisition.status !== "SUBMITTED") throw new HttpError(409, "Requisition already decided");
  if (!raw.lines || typeof raw.lines !== "object" || Array.isArray(raw.lines)) throw new HttpError(400, "lines must be an object of lineId -> qtyApproved");
  const decisions = raw.lines as Record<string, unknown>;

  const lines = await tx.select().from(internalRequisitionLines).where(eq(internalRequisitionLines.requisitionId, requisitionId));
  for (const line of lines) {
    const decided = decisions[line.id];
    if (decided === undefined) throw new HttpError(400, `Missing approval decision for line ${line.id}`);
    const qtyApproved = quantity(decided, true);
    if (qtyApproved < 0n || qtyApproved > quantity(line.qtyRequested, true)) throw new HttpError(400, `Approved qty for line ${line.id} must be between 0 and the requested qty`);
    await tx.update(internalRequisitionLines).set({ qtyApproved: decimal(qtyApproved), status: qtyApproved > 0n ? "APPROVED" : "REJECTED" }).where(eq(internalRequisitionLines.id, line.id));
  }
  await tx.update(internalRequisitions).set({ status: "APPROVED", approvedById: actor.id, approvedAt: new Date() }).where(eq(internalRequisitions.id, requisitionId));
  return loadRequisition(tx, requisitionId);
}

// Cancels the REMAINING outstanding (qtyApproved minus already-issued) on
// a line — already-dispatched real stock is never touched. Only the
// Owner, or the requesting branch's own actor, may cancel.
export async function cancelRequisitionLine(tx: Executor, actor: Identity, lineId: string) {
  const [line] = await tx.select().from(internalRequisitionLines).where(eq(internalRequisitionLines.id, lineId)).limit(1);
  if (!line) throw new HttpError(404, "Requisition line not found");
  const [requisition] = await tx.select().from(internalRequisitions).where(eq(internalRequisitions.id, line.requisitionId)).limit(1);
  if (!requisition) throw new HttpError(404, "Requisition not found");
  branchScope(actor, requisition.branchId);
  if (line.status === "CANCELLED" || line.status === "REJECTED") return line;
  await tx.update(internalRequisitionLines).set({ status: "CANCELLED" }).where(eq(internalRequisitionLines.id, lineId));
  const [updated] = await tx.select().from(internalRequisitionLines).where(eq(internalRequisitionLines.id, lineId));
  return updated;
}

// Validates and is called from the EXISTING transfer dispatch flows
// (stock-transfers/route.ts, semi-fg-transfers.ts) when a dispatch declares
// a requisitionLineId — never duplicated dispatch logic here. Returns
// nothing; throws on any violation.
export async function assertRequisitionLineFulfillable(tx: Executor, lineId: string, expectedType: "RAW" | "PREPARED", expectedBranchId: string, qtyThisDispatch: string) {
  const [line] = await tx.select().from(internalRequisitionLines).where(eq(internalRequisitionLines.id, lineId)).limit(1);
  if (!line) throw new HttpError(400, "Requisition line not found");
  if (line.lineType !== expectedType) throw new HttpError(400, `Requisition line is ${line.lineType}, not ${expectedType}`);
  if (line.status !== "APPROVED") throw new HttpError(409, "Requisition line is not in an approved, fulfillable state");
  const [requisition] = await tx.select().from(internalRequisitions).where(eq(internalRequisitions.id, line.requisitionId)).limit(1);
  if (!requisition || requisition.branchId !== expectedBranchId) throw new HttpError(400, "Requisition line does not belong to the destination branch of this dispatch");

  const alreadyIssued = line.lineType === "RAW"
    ? (await tx.select({ total: sum(stockTransfers.qtyDispatched) }).from(stockTransfers).where(eq(stockTransfers.requisitionLineId, lineId)))[0]?.total
    : (await tx.select({ total: sum(semiFgTransfers.qtyDispatched) }).from(semiFgTransfers).where(eq(semiFgTransfers.requisitionLineId, lineId)))[0]?.total;
  const issuedSoFar = quantity(alreadyIssued ?? "0", true);
  const newTotal = issuedSoFar + quantity(qtyThisDispatch, true);
  if (newTotal > quantity(line.qtyApproved!, true)) throw new HttpError(409, `This dispatch would exceed the approved quantity for requisition line ${lineId} (approved ${line.qtyApproved}, already issued ${decimal(issuedSoFar)}, this dispatch ${qtyThisDispatch})`);
}

async function loadRequisition(tx: Executor, id: string) {
  const [requisition] = await tx.select().from(internalRequisitions).where(eq(internalRequisitions.id, id)).limit(1);
  const lines = await tx.select().from(internalRequisitionLines).where(eq(internalRequisitionLines.requisitionId, id));
  const linesWithFulfillment = await Promise.all(lines.map(async (line) => {
    const issuedRow = line.lineType === "RAW"
      ? (await tx.select({ total: sum(stockTransfers.qtyDispatched) }).from(stockTransfers).where(eq(stockTransfers.requisitionLineId, line.id)))[0]
      : (await tx.select({ total: sum(semiFgTransfers.qtyDispatched) }).from(semiFgTransfers).where(eq(semiFgTransfers.requisitionLineId, line.id)))[0];
    const receivedRow = line.lineType === "RAW"
      ? (await tx.select({ total: sum(stockTransfers.qtyReceived) }).from(stockTransfers).where(eq(stockTransfers.requisitionLineId, line.id)))[0]
      : (await tx.select({ total: sum(semiFgTransfers.qtyReceived) }).from(semiFgTransfers).where(eq(semiFgTransfers.requisitionLineId, line.id)))[0];
    return { ...line, qtyIssued: decimal(quantity(issuedRow?.total ?? "0", true)), qtyReceived: decimal(quantity(receivedRow?.total ?? "0", true)) };
  }));
  return { ...requisition, lines: linesWithFulfillment };
}

export async function getRequisition(tx: Executor, actor: Identity, id: string) {
  const [requisition] = await tx.select().from(internalRequisitions).where(eq(internalRequisitions.id, id)).limit(1);
  if (!requisition) throw new HttpError(404, "Requisition not found");
  branchScope(actor, requisition.branchId);
  return loadRequisition(tx, id);
}

export async function listRequisitions(tx: Executor, actor: Identity, query: { branchId?: string | null } = {}) {
  const scope = branchScope(actor, query.branchId);
  const rows = await tx.select().from(internalRequisitions).where(scope ? eq(internalRequisitions.branchId, scope) : undefined).orderBy(desc(internalRequisitions.createdAt)).limit(200);
  return Promise.all(rows.map((row) => loadRequisition(tx, row.id)));
}
