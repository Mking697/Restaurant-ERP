import { HttpError } from "./permissions";
import { string } from "./http";
import { allowedFields } from "./purchase";
import { decimal, quantity, MAX_QUANTITY } from "./production-quantity";

export const QUALITY_ACTION = "GRN_QUALITY_RECORDED";
export const qualityReceiptId = (id: string) => `grn-quality:${id}`;
export const qualityOriginId = (id: string) => `grn-origin:${id}`;
export function validQualityOrigin(grn: { id: string; branchId: string; poId: string }, receipt?: { id: string; entityType: string; entityId: string; action: string; metadataJson: unknown } | null) {
  if (!receipt || receipt.id !== qualityOriginId(grn.id) || receipt.entityType !== "GRN" || receipt.entityId !== grn.id || receipt.action !== "GRN_CREATED") return false;
  const metadata = receipt.metadataJson as { version?: number; branchId?: string; poId?: string } | null;
  return metadata?.version === 1 && metadata.branchId === grn.branchId && metadata.poId === grn.poId;
}
export interface QualityInput {
  result: "PASS" | "FAIL" | "PARTIAL";
  lines: { id: string; qtyFailed: string }[];
  note: string;
  photoUrl: string;
}
export interface QualityLine {
  id: string; rawMaterialId: string | null; itemDescription: string;
  qtyOrdered: string; qtyReceived: string; qtyFailed: string;
}
export interface StockCredit { rawMaterialId: string; qty: string; }
function reference(value: unknown, field: string, max: number) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > max) throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}
export function parseQualityInput(input: Record<string, unknown>): QualityInput {
  allowedFields(input, ["result", "lines", "note", "photoUrl"]);
  if (!["PASS", "FAIL", "PARTIAL"].includes(input.result as string)) throw new HttpError(400, "Invalid quality result");
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 50) throw new HttpError(400, "Quality requires 1-50 lines");
  const ids = new Set<string>();
  const lines = input.lines.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid quality line");
    const line = value as Record<string, unknown>;
    allowedFields(line, ["id", "qtyFailed"]);
    const id = string(line.id, "GRN line ID");
    if (ids.has(id)) throw new HttpError(400, "Duplicate quality line ID");
    ids.add(id);
    return { id, qtyFailed: decimal(quantity(line.qtyFailed, true)) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const note = reference(input.note, "quality note", 1000);
  if (input.result !== "PASS" && note.length < 3) throw new HttpError(400, "Failure reason must be 3-1000 characters");
  return { result: input.result as QualityInput["result"], lines, note, photoUrl: reference(input.photoUrl, "evidence reference", 2000) };
}
export function sameQualityRequest(a: QualityInput, b: QualityInput) { return JSON.stringify(a) === JSON.stringify(b); }
export function persistedQuantity(value: string, allowZero = false): bigint {
  try { return quantity(value, allowZero); } catch { throw new HttpError(409, "Invalid persisted GRN/stock quantity; reconciliation required"); }
}
export function qualityDecision(input: QualityInput, lines: QualityLine[], general: boolean) {
  if (!lines.length || lines.length > 50 || new Set(lines.map(l => l.id)).size !== lines.length) throw new HttpError(409, "Invalid GRN lines; reconciliation required");
  const byId = new Map(input.lines.map(l => [l.id, l.qtyFailed]));
  if (byId.size !== lines.length || lines.some(l => !byId.has(l.id))) throw new HttpError(400, "Supply every GRN line exactly once");
  const totals = new Map<string, bigint>();
  let hasFailed = false, hasAccepted = false;
  const failedLines = lines.map(line => {
    if (general ? line.rawMaterialId !== null || !line.itemDescription.trim() : !line.rawMaterialId || !!line.itemDescription.trim()) throw new HttpError(409, "GRN material kind mismatch; reconciliation required");
    const received = persistedQuantity(line.qtyReceived), ordered = persistedQuantity(line.qtyOrdered);
    if (received > ordered) throw new HttpError(409, "GRN received quantity exceeds ordered quantity; reconciliation required");
    const failed = quantity(byId.get(line.id), true);
    if (failed > received) throw new HttpError(400, "Failed quantity exceeds received quantity");
    hasFailed ||= failed > 0n;
    hasAccepted ||= failed < received;
    if (line.rawMaterialId && failed < received) {
      const total = (totals.get(line.rawMaterialId) ?? 0n) + received - failed;
      if (total > MAX_QUANTITY) throw new HttpError(409, "Accepted stock exceeds capacity");
      totals.set(line.rawMaterialId, total);
    }
    return { id: line.id, qtyFailed: decimal(failed) };
  });
  if ((input.result === "PASS" && hasFailed) || (input.result === "FAIL" && hasAccepted) || (input.result === "PARTIAL" && (!hasFailed || !hasAccepted))) throw new HttpError(400, "Quality result does not match line failed quantities");
  return { failedLines, credits: [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([rawMaterialId, amount]) => ({ rawMaterialId, qty: decimal(amount) })) };
}
interface ReceiptRow { id: string; entityId: string; entityType: string; action: string; createdAt: Date; metadataJson: unknown; }
interface FinalGrn { id: string; branchId: string; isGeneralPurchase: boolean; status: string; qualityResult: string; qualityNote: string; qualityPhotoUrl: string; }
export function qualityReceiptState(grn: FinalGrn, lines: QualityLine[], receipt?: ReceiptRow | null) {
  const absent = { qualityRecorded: false, inventoryPosted: false, qualityRecordedAt: null as string | null };
  if (!receipt || receipt.id !== qualityReceiptId(grn.id) || receipt.entityType !== "GRN" || receipt.entityId !== grn.id || receipt.action !== QUALITY_ACTION) return absent;
  try {
    const data = receipt.metadataJson as { version: number; branchId: string; request: Record<string, unknown>; credits: StockCredit[] };
    if (!data || data.version !== 1 || data.branchId !== grn.branchId) return absent;
    const request = parseQualityInput(data.request);
    if (grn.status !== (request.result === "FAIL" ? "QUALITY_HOLD" : "APPROVED")) return absent;
    const decision = qualityDecision(request, lines, grn.isGeneralPurchase);
    if (!Array.isArray(data.credits)) return absent;
    const credits = data.credits.map(credit => ({ rawMaterialId: string(credit.rawMaterialId, "receipt material"), qty: decimal(quantity(credit.qty)) })).sort((a, b) => a.rawMaterialId.localeCompare(b.rawMaterialId));
    if (request.result !== grn.qualityResult || request.note !== grn.qualityNote || request.photoUrl !== grn.qualityPhotoUrl || JSON.stringify(credits) !== JSON.stringify(decision.credits)) return absent;
    const stored = new Map(lines.map(line => [line.id, decimal(persistedQuantity(line.qtyFailed, true))]));
    if (request.lines.some(line => stored.get(line.id) !== line.qtyFailed)) return absent;
    return { qualityRecorded: true, inventoryPosted: decision.credits.length > 0, qualityRecordedAt: receipt.createdAt.toISOString() };
  } catch { return absent; }
}
