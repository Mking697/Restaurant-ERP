import { randomUUID } from "node:crypto";
import { numeric, string } from "./http";
import { HttpError } from "./permissions";

// Pure, side-effect-free validation/shaping helpers for the Indent + PO
// workflow — kept out of the route handlers so they can be unit tested
// directly (same convention as workforce-policy.ts / expenses.ts).

export function allowedFields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some((k) => !allowed.includes(k))) throw new HttpError(400, "Unexpected field");
}

export const INDENT_LINE_MAX = 50;
export const PO_LINE_MAX = 50;

export const INDENT_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "PO_RAISED"] as const;
export const PO_STATUSES = ["CREATED", "SENT", "DISPATCHED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"] as const;
export const GRN_STATUSES = ["PENDING", "RECEIVED", "QUALITY_HOLD", "APPROVED"] as const;

export function parseStatusFilter<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new HttpError(400, "Invalid status filter");
  return value as T;
}

export interface ParsedIndentLine { rawMaterialId: string; qty: string; }
export function parseIndentLines(value: unknown): ParsedIndentLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > INDENT_LINE_MAX) {
    throw new HttpError(400, `Indent needs 1-${INDENT_LINE_MAX} lines`);
  }
  return value.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, `Invalid line ${i + 1}`);
    const line = raw as Record<string, unknown>;
    allowedFields(line, ["rawMaterialId", "qty"]);
    const rawMaterialId = string(line.rawMaterialId, `line ${i + 1} rawMaterialId`);
    const qty = numeric(line.qty, `line ${i + 1} qty`);
    if (Number(qty) <= 0) throw new HttpError(400, `Line ${i + 1} qty must be greater than zero`);
    return { rawMaterialId, qty };
  });
}

export interface ParsedPoLine { rawMaterialId: string | null; itemDescription: string; qty: string; rate: string; }
export function parsePoLines(value: unknown, isGeneralPurchase: boolean): ParsedPoLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PO_LINE_MAX) {
    throw new HttpError(400, `Purchase order needs 1-${PO_LINE_MAX} lines`);
  }
  return value.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, `Invalid line ${i + 1}`);
    const line = raw as Record<string, unknown>;
    allowedFields(line, ["rawMaterialId", "itemDescription", "qty", "rate"]);
    const qty = numeric(line.qty, `line ${i + 1} qty`);
    if (Number(qty) <= 0) throw new HttpError(400, `Line ${i + 1} qty must be greater than zero`);
    const rate = numeric(line.rate, `line ${i + 1} rate`);
    if (isGeneralPurchase) {
      if (line.rawMaterialId !== undefined && line.rawMaterialId !== null) {
        throw new HttpError(400, `Line ${i + 1}: general purchase lines cannot reference a raw material`);
      }
      const itemDescription = string(line.itemDescription, `line ${i + 1} itemDescription`, 300);
      return { rawMaterialId: null, itemDescription, qty, rate };
    }
    if (line.itemDescription !== undefined && line.itemDescription !== null && line.itemDescription !== "") {
      throw new HttpError(400, `Line ${i + 1}: store purchase lines must reference a raw material, not free text`);
    }
    const rawMaterialId = string(line.rawMaterialId, `line ${i + 1} rawMaterialId`);
    return { rawMaterialId, itemDescription: "", qty, rate };
  });
}

export function parseGeneralPurchase(value: unknown): boolean {
  if (typeof value !== "boolean") throw new HttpError(400, "isGeneralPurchase must be a boolean");
  return value;
}

export function parsePoIndentId(value: unknown, isGeneralPurchase: boolean): string | null {
  const id = value === undefined || value === null || value === "" ? null : string(value, "indentId");
  if (isGeneralPurchase && id) throw new HttpError(400, "General purchases cannot reference an Indent");
  if (!isGeneralPurchase && !id) throw new HttpError(400, "Store purchases require an APPROVED indent");
  return id;
}

// Compare integer thousandths, never binary floating-point sums. Duplicate
// materials in either document count toward the same approved quantity.
export function assertPoMatchesIndent(lines: Pick<ParsedPoLine, "rawMaterialId" | "qty">[], approved: ParsedIndentLine[]) {
  const aggregate = (items: Pick<ParsedPoLine, "rawMaterialId" | "qty">[]) => {
    const totals = new Map<string, bigint>();
    if (!items.length) throw new HttpError(400, "Approved indent must contain materials");
    for (const line of items) {
      const id = string(line.rawMaterialId, "rawMaterialId");
      const [whole, fraction = ""] = numeric(line.qty, "qty").split(".");
      const qty = BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
      if (qty <= BigInt(0)) throw new HttpError(400, "Quantity must be greater than zero");
      totals.set(id, (totals.get(id) ?? BigInt(0)) + qty);
    }
    return totals;
  };
  const actual = aggregate(lines), expected = aggregate(approved);
  if (actual.size !== expected.size || [...expected].some(([id, qty]) => actual.get(id) !== qty)) {
    throw new HttpError(400, "PO materials and quantities must exactly match the approved indent");
  }
}

export function generatePoNumber(): string {
  return `PO-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

export function assertIndentDraft(status: string) {
  if (status !== "DRAFT") throw new HttpError(409, "Indent must be in DRAFT status to submit for approval");
}
export function assertIndentPending(status: string) {
  if (status !== "PENDING_APPROVAL") throw new HttpError(409, "Indent must be PENDING_APPROVAL to review");
}
export function assertIndentApprovedForPo(status: string) {
  if (status !== "APPROVED") throw new HttpError(409, "Only an APPROVED indent can be used to raise a Purchase Order");
}
export function assertPoNotBilled(billUploadedAt: Date | null) {
  if (billUploadedAt) throw new HttpError(409, "Bill already recorded for this purchase order");
}
export function assertPoNotReceived(materialReceivedAt: Date | null) {
  if (materialReceivedAt) throw new HttpError(409, "Material already received for this purchase order");
}
// Bill upload is explicitly text/URL-only in this pass — no real file-upload
// pipeline (S3 etc.) exists yet in this codebase, matching the contract's
// "don't invent a fake upload" instruction.
export function billUrl(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return string(value, "pdfUrl", 2000);
}
