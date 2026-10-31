import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray } from "drizzle-orm";
import { grnLines, grns } from "../../db/schema/purchase";
import { numeric, string } from "./http";
import { HttpError } from "./permissions";
import type { Executor } from "./auth";
import { decimal, quantity } from "./production-quantity";

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

// --- AUTOMATION-1c: real indent spike detection against the rolling average
// of actually-posted GRN receipts -------------------------------------------
//
// >25% spike threshold is fixed by the schema comment on indentStatusEnum
// (src/db/schema/purchase.ts) — not changed here. Window/minimum-samples are
// this pass's own scoped defaults, matching the project's existing "never
// fabricate from insufficient data" convention (VAT missing-rate handling,
// MIS component re-normalization): with fewer than
// ROLLING_AVERAGE_MIN_SAMPLES real data points in the trailing window for a
// (branch, material) pair, no average/spike figure is computed at all.
export const ROLLING_AVERAGE_WINDOW_DAYS = 30;
export const ROLLING_AVERAGE_MIN_SAMPLES = 3;
export const SPIKE_THRESHOLD_PERCENT = 25;

export interface MaterialRollingAverage { rawMaterialId: string; avgQtyMillis: bigint; sampleCount: number; }

// Only counts GRN lines that actually posted accepted stock into Inventory:
// grns.status === "APPROVED" (set exactly when the real quality decision was
// PASS/PARTIAL, see recordGrnQuality in grn-quality.ts) within the trailing
// window. A still-PENDING (not yet quality-checked) or QUALITY_HOLD (FAIL)
// GRN never posted real stock and is excluded — these are the real,
// already-posted inventory receipts, never draft/rejected quantities.
export async function computeRollingAverages(
  tx: Executor,
  branchId: string,
  rawMaterialIds: string[],
  now: Date = new Date(),
): Promise<Map<string, MaterialRollingAverage>> {
  const result = new Map<string, MaterialRollingAverage>();
  if (!rawMaterialIds.length) return result;
  const windowStart = new Date(now.getTime() - ROLLING_AVERAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await tx
    .select({ rawMaterialId: grnLines.rawMaterialId, qtyReceived: grnLines.qtyReceived, qtyFailed: grnLines.qtyFailed })
    .from(grnLines)
    .innerJoin(grns, eq(grns.id, grnLines.grnId))
    .where(and(
      eq(grns.branchId, branchId),
      eq(grns.status, "APPROVED"),
      inArray(grnLines.rawMaterialId, rawMaterialIds),
      gte(grns.createdAt, windowStart),
    ));
  const sums = new Map<string, { sum: bigint; count: number }>();
  for (const row of rows) {
    if (!row.rawMaterialId) continue;
    const accepted = quantity(row.qtyReceived, true) - quantity(row.qtyFailed, true);
    if (accepted <= 0n) continue; // a fully-failed line never posted any real stock
    const bucket = sums.get(row.rawMaterialId) ?? { sum: 0n, count: 0 };
    bucket.sum += accepted;
    bucket.count += 1;
    sums.set(row.rawMaterialId, bucket);
  }
  for (const [rawMaterialId, { sum, count }] of sums) {
    if (count < ROLLING_AVERAGE_MIN_SAMPLES) continue; // explicitly NOT a fabricated average
    result.set(rawMaterialId, { rawMaterialId, avgQtyMillis: sum / BigInt(count), sampleCount: count });
  }
  return result;
}

export interface IndentSpikeLineSnapshot { avgQty: string; sampleCount: number; requestedQty: string; pctOverAvg: number; }
export interface IndentSpikeResult {
  dailyAvgQtyJson: Record<string, IndentSpikeLineSnapshot> | null;
  spikePercent: string | null;
  hasData: boolean; // true only when every requested material has an adequate positive baseline
  isSpike: boolean;
}

// Pure comparison: real averages in, decision out — kept side-effect-free so
// it can be unit tested directly, same convention as the rest of this file.
// Multiple lines for the same material are aggregated first by the caller
// (assertPoMatchesIndent uses the same "aggregate before compare" pattern).
export function evaluateIndentSpike(
  lines: { rawMaterialId: string; qty: string }[],
  averages: Map<string, MaterialRollingAverage>,
): IndentSpikeResult {
  const snapshot: Record<string, IndentSpikeLineSnapshot> = {};
  let anySpike = false;
  let maxPct = -Infinity;
  for (const line of lines) {
    const avg = averages.get(line.rawMaterialId);
    if (!avg || avg.avgQtyMillis <= 0n || avg.sampleCount < ROLLING_AVERAGE_MIN_SAMPLES) {
      // A partial comparison cannot justify approving the whole request or
      // persisting an indent-wide spike figure. Unknown materials need review.
      return { dailyAvgQtyJson: null, spikePercent: null, hasData: false, isSpike: false };
    }
    const requestedMillis = quantity(line.qty);
    // Exact-integer threshold check (avoids any floating-point comparison):
    // requested > avg * (1 + threshold/100)  <=>  requested*100 > avg*(100+threshold)
    const exceeds = requestedMillis * 100n > avg.avgQtyMillis * BigInt(100 + SPIKE_THRESHOLD_PERCENT);
    const pct = (Number(requestedMillis - avg.avgQtyMillis) / Number(avg.avgQtyMillis)) * 100;
    snapshot[line.rawMaterialId] = {
      avgQty: decimal(avg.avgQtyMillis),
      sampleCount: avg.sampleCount,
      requestedQty: decimal(requestedMillis),
      pctOverAvg: Math.round(pct * 100) / 100,
    };
    if (exceeds) anySpike = true;
    if (pct > maxPct) maxPct = pct;
  }
  const hasData = Object.keys(snapshot).length > 0;
  if (!hasData || !anySpike) return { dailyAvgQtyJson: null, spikePercent: null, hasData, isSpike: false };
  const clamped = Math.min(999.99, Math.round(maxPct * 100) / 100); // numeric(5,2) column ceiling
  return { dailyAvgQtyJson: snapshot, spikePercent: clamped.toFixed(2), hasData: true, isSpike: true };
}

// Aggregates duplicate-material indent lines into one qty per material,
// exact-decimal (never binary floating point), same pattern as
// assertPoMatchesIndent's own aggregate() helper above.
export function aggregateIndentLinesByMaterial(lines: { rawMaterialId: string; qty: string }[]): { rawMaterialId: string; qty: string }[] {
  const totals = new Map<string, bigint>();
  for (const line of lines) totals.set(line.rawMaterialId, (totals.get(line.rawMaterialId) ?? 0n) + quantity(line.qty));
  return [...totals].map(([rawMaterialId, total]) => ({ rawMaterialId, qty: decimal(total) }));
}
