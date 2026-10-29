import { HttpError } from "./permissions";
import { decimal } from "./production-quantity";
import { persistedQuantity } from "./grn-quality-policy";

export const RETURN_ACTION = "GRN_VENDOR_RETURN_RECORDED";
export const returnReceiptId = (grnId: string) => `grn-returns:${grnId}`;
export interface ReturnSource {
  id: string; branchId: string; poId: string; vendorId: string; qualityNote: string;
  lines: { id: string; qtyFailed: string; rateOrdered: string }[];
}
export interface ClaimLine { id: string; grnLineId: string; branchId: string; qtyReturned: string; refundAmountInr: string; reasonNote: string; }
function paise(value: string, digits = 10) {
  if (typeof value !== "string" || !new RegExp(`^\\d{1,${digits}}(?:\\.\\d{1,2})?$`).test(value)) throw new HttpError(409, "Invalid saved vendor claim amount/rate; reconciliation required");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function amount(value: bigint) { return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`; }
export function returnPlan(source: ReturnSource): ClaimLine[] {
  const result = source.lines.filter(line => persistedQuantity(line.qtyFailed, true) > 0n).map(line => {
    const qty = persistedQuantity(line.qtyFailed);
    const refund = (qty * paise(line.rateOrdered, 8) + 500n) / 1000n;
    if (refund > 999999999999n) throw new HttpError(409, "Vendor claim amount exceeds capacity");
    return { id: `grn-return:${line.id}`, grnLineId: line.id, branchId: source.branchId, qtyReturned: decimal(qty), refundAmountInr: amount(refund), reasonNote: source.qualityNote };
  });
  if (!source.lines.length || source.lines.length > 50 || new Set(source.lines.map(line => line.id)).size !== source.lines.length || !result.length) throw new HttpError(409, "No valid failed lines for a vendor claim");
  return result.sort((a,b) => a.grnLineId.localeCompare(b.grnLineId));
}

export interface StoredClaim extends ClaimLine { grnId: string; submittedToAccountsAt: Date | null; }
interface ReturnReceipt { id: string; entityType: string; entityId: string; action: string; metadataJson: unknown; }
export function validReturnReceipt(source: ReturnSource, rows: StoredClaim[], receipt?: ReturnReceipt | null) {
  if (!receipt || receipt.id !== returnReceiptId(source.id) || receipt.entityType !== "GRN" || receipt.entityId !== source.id || receipt.action !== RETURN_ACTION) return false;
  try {
    const data = receipt.metadataJson as { version: number; branchId: string; poId: string; vendorId: string; claims: ClaimLine[] };
    if (!data || data.version !== 1 || data.branchId !== source.branchId || data.poId !== source.poId || data.vendorId !== source.vendorId || !Array.isArray(data.claims)) return false;
    const expected = returnPlan(source);
    if (rows.length !== expected.length || data.claims.length !== expected.length || rows.some(row => row.grnId !== source.id || !row.submittedToAccountsAt || !Number.isFinite(row.submittedToAccountsAt.getTime()))) return false;
    const canonical = (claims: ClaimLine[]) => claims.map(line => ({ id: line.id, grnLineId: line.grnLineId, branchId: line.branchId, qtyReturned: decimal(persistedQuantity(line.qtyReturned)), refundAmountInr: amount(paise(line.refundAmountInr)), reasonNote: line.reasonNote })).sort((a,b) => a.grnLineId.localeCompare(b.grnLineId));
    return JSON.stringify(canonical(rows)) === JSON.stringify(expected) && JSON.stringify(canonical(data.claims)) === JSON.stringify(expected);
  } catch { return false; }
}
