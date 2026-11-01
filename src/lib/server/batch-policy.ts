import { HttpError } from "./permissions";
import { decimal, quantity } from "./production-quantity";

export type ExpiryStatus = "UNKNOWN" | "DATED" | "NON_EXPIRING";
export interface BatchInput { batchNo: string | null; expiryDate: string | null; expiryStatus: ExpiryStatus; evidence: string; }
export function calendarDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000") || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new HttpError(400, "expiryDate must be a real YYYY-MM-DD calendar date");
  return value;
}
export function parseBatchInput(input: Record<string, unknown>, owner: boolean): BatchInput {
  if (input.nonExpiring !== undefined && typeof input.nonExpiring !== "boolean") throw new HttpError(400, "nonExpiring must be boolean");
  const expiryDate = calendarDate(input.expiryDate);
  const evidence = input.evidence === undefined ? "" : text(input.evidence, "evidence", 2000);
  const batchNo = input.batchNo === undefined ? null : text(input.batchNo, "batchNo", 200);
  if (input.nonExpiring && expiryDate) throw new HttpError(400, "Choose expiryDate or nonExpiring, not both");
  if (input.nonExpiring && !owner) throw new HttpError(403, "Owner verification required for non-expiring stock");
  if (input.nonExpiring && evidence.length < 3) throw new HttpError(400, "Auditable evidence is required");
  return { batchNo, expiryDate, expiryStatus: expiryDate ? "DATED" : input.nonExpiring ? "NON_EXPIRING" : "UNKNOWN", evidence };
}
export function text(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}
export function fields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new HttpError(400, "Unexpected field");
}
export function reconciliationLots(onHand: string, batchQty: string, values: unknown, evidenceValue: unknown) {
  const evidence = text(evidenceValue, "evidence", 2000);
  if (evidence.length < 3) throw new HttpError(400, "Evidence is required");
  const difference = quantity(onHand, true) - quantity(batchQty, true);
  if (difference <= 0n) throw new HttpError(409, "No positive unbatched difference; reconcile saved balances first");
  if (!Array.isArray(values) || !values.length || values.length > 100) throw new HttpError(400, "Supply 1-100 real lots");
  const lots = values.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid lot");
    fields(value, ["batchNo", "qty", "expiryDate", "nonExpiring"]);
    const batchNo = text(value.batchNo, "batchNo");
    return { ...parseBatchInput({ ...value, evidence }, true), batchNo, qty: decimal(quantity(value.qty)) };
  });
  if (lots.reduce((sum, lot) => sum + quantity(lot.qty), 0n) !== difference) throw new HttpError(409, "Lot total must equal the exact unbatched difference");
  return lots;
}
export function transferReceiptInput(input: Record<string, unknown>, allocations: { id: string; qtyDispatched: string }[]) {
  fields(input, ["qtyReceived", "allocations"]);
  const received = quantity(input.qtyReceived, true);
  const dispatched = allocations.reduce((sum, row) => sum + quantity(row.qtyDispatched), 0n);
  if (received > dispatched) throw new HttpError(400, "Receipt exceeds dispatched quantity");
  let lines: { allocationId: string; qtyReceived: string }[];
  if (input.allocations === undefined) {
    if (allocations.length > 1 && received !== dispatched) throw new HttpError(400, "Short multi-lot receipt requires explicit allocations");
    lines = allocations.map(row => ({ allocationId: row.id, qtyReceived: decimal(allocations.length === 1 ? received : quantity(row.qtyDispatched)) }));
  } else {
    if (!Array.isArray(input.allocations) || input.allocations.length !== allocations.length) throw new HttpError(400, "Supply every allocation exactly once");
    lines = input.allocations.map(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid receipt allocation");
      fields(value, ["allocationId", "qtyReceived"]);
      return { allocationId: text(value.allocationId, "allocationId"), qtyReceived: decimal(quantity(value.qtyReceived, true)) };
    });
  }
  const saved = new Map(allocations.map(row => [row.id, quantity(row.qtyDispatched)]));
  if (new Set(lines.map(line => line.allocationId)).size !== allocations.length || lines.some(line => !saved.has(line.allocationId) || quantity(line.qtyReceived, true) > saved.get(line.allocationId)!)) throw new HttpError(400, "Invalid receipt allocation quantity or identity");
  if (lines.reduce((sum, line) => sum + quantity(line.qtyReceived, true), 0n) !== received) throw new HttpError(400, "Receipt allocation total differs from qtyReceived");
  return { qtyReceived: decimal(received), allocations: lines.sort((a, b) => a.allocationId.localeCompare(b.allocationId)) };
}
export function batchDisposition(batch: { expiryDate: string | null; expiryStatus?: string }, asOf: string) {
  // A real date on a legacy row is credible; a missing date is never proof of non-expiry.
  const expiryStatus: ExpiryStatus = batch.expiryDate ? "DATED" : batch.expiryStatus === "NON_EXPIRING" ? "NON_EXPIRING" : "UNKNOWN";
  const expired = batch.expiryDate !== null && batch.expiryDate < asOf;
  return { expiryStatus, expired, held: expiryStatus === "UNKNOWN" || expired };
}
