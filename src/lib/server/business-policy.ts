import { getSetting, upsertSetting } from "../settings";
import { HttpError } from "./permissions";

// --- P0 decision (October 31, 2026): the Owner wants both of these
// thresholds to be configurable at runtime (via a Settings screen), not a
// fixed value chosen by a developer. Reuses the existing generic key/value
// `settings` table (src/db/schema/settings.ts) — same convention as
// branding.ts / the WhatsApp provider settings — so no schema migration is
// needed for this slice.
export const INDENT_VALUE_THRESHOLD_KEY = "INDENT_HO_APPROVAL_VALUE_THRESHOLD_TSH";
export const COST_YIELD_TOLERANCE_KEY = "COST_YIELD_VARIANCE_TOLERANCE_PERCENT";
// GAP-006 decision (October 31, 2026): near-expiry warning threshold is
// Owner-configurable, no fixed default chosen by a developer — same
// convention as the two keys above.
export const NEAR_EXPIRY_WARNING_DAYS_KEY = "NEAR_EXPIRY_WARNING_DAYS";

export interface BusinessPolicySettings {
  // null = not configured => the corresponding gate/feature stays disabled
  // rather than silently defaulting to a guessed number.
  indentValueThresholdTsh: string | null;
  // Stored now so the Owner can set it once; NOT YET ENFORCED anywhere —
  // actual cost/yield variance detection needs GAP-009 (actual cutting
  // yield) and GAP-010 (production-lot actual cost) to exist first. Wiring
  // this into an approval gate is future work for that phase, not this one.
  costYieldTolerancePercent: string | null;
  // null = no near-expiry highlighting anywhere (GET /api/inventory/batches
  // still reports hard "expired" correctly either way — only the SOFT
  // "near expiry" warning flag depends on this being set).
  nearExpiryWarningDays: string | null;
}

export async function readBusinessPolicy(): Promise<BusinessPolicySettings> {
  const [threshold, tolerance, nearExpiryDays] = await Promise.all([
    getSetting(INDENT_VALUE_THRESHOLD_KEY),
    getSetting(COST_YIELD_TOLERANCE_KEY),
    getSetting(NEAR_EXPIRY_WARNING_DAYS_KEY),
  ]);
  return {
    indentValueThresholdTsh: threshold.trim() === "" ? null : threshold,
    costYieldTolerancePercent: tolerance.trim() === "" ? null : tolerance,
    nearExpiryWarningDays: nearExpiryDays.trim() === "" ? null : nearExpiryDays,
  };
}

function parseNonNegativeDecimal(raw: string, field: string, maxValue?: number): string {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new HttpError(400, `${field} must be a non-negative number with at most 2 decimals`);
  }
  if (maxValue !== undefined && Number(trimmed) > maxValue) {
    throw new HttpError(400, `${field} cannot exceed ${maxValue}`);
  }
  return trimmed;
}

function parseNonNegativeInt(raw: string, field: string, maxValue: number): string {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) throw new HttpError(400, `${field} must be a whole number of days`);
  if (Number(trimmed) > maxValue) throw new HttpError(400, `${field} cannot exceed ${maxValue}`);
  return trimmed;
}

export interface BusinessPolicyInput {
  indentValueThresholdTsh?: string; // "" clears/disables the gate
  costYieldTolerancePercent?: string; // "" clears it
  nearExpiryWarningDays?: string; // "" clears it
}

export async function saveBusinessPolicy(input: BusinessPolicyInput): Promise<BusinessPolicySettings> {
  const writes: [string, string][] = [];
  for (const value of Object.values(input)) if (value !== undefined && typeof value !== "string") throw new HttpError(400, "Policy values must be strings");
  if (input.indentValueThresholdTsh !== undefined) {
    const trimmed = input.indentValueThresholdTsh.trim();
    const value = trimmed === "" ? "" : parseNonNegativeDecimal(trimmed, "Indent HO-approval value threshold (TSh)");
    writes.push([INDENT_VALUE_THRESHOLD_KEY, value]);
  }
  if (input.costYieldTolerancePercent !== undefined) {
    const trimmed = input.costYieldTolerancePercent.trim();
    const value = trimmed === "" ? "" : parseNonNegativeDecimal(trimmed, "Cost/yield variance tolerance (%)", 100);
    writes.push([COST_YIELD_TOLERANCE_KEY, value]);
  }
  if (input.nearExpiryWarningDays !== undefined) {
    const trimmed = input.nearExpiryWarningDays.trim();
    const value = trimmed === "" ? "" : parseNonNegativeInt(trimmed, "Near-expiry warning (days)", 365);
    writes.push([NEAR_EXPIRY_WARNING_DAYS_KEY, value]);
  }
  await Promise.all(writes.map(([key, value]) => upsertSetting(key, value)));
  return readBusinessPolicy();
}
