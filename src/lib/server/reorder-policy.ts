import { createHash } from "node:crypto";
import { HttpError } from "./permissions";

type PositionInput = {
  usable: string;
  requisitionOutstanding: string;
  transferInTransit: string;
  externalPoOutstanding: string;
  qualityPending: string;
  pendingRequests?: string;
};

function millis(value: string): bigint {
  if (!/^-?\d+(\.\d{1,3})?$/.test(value)) throw new HttpError(500, `Invalid saved quantity: ${value}`);
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const out = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return negative ? -out : out;
}
function decimal(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 1000n}.${String(abs % 1000n).padStart(3, "0")}`;
}

export function computeInventoryPosition(input: PositionInput): string {
  return decimal(millis(input.usable) + millis(input.requisitionOutstanding) + millis(input.transferInTransit) + millis(input.externalPoOutstanding) + millis(input.qualityPending) + millis(input.pendingRequests ?? "0"));
}

export function computeSuggestedQty(maxStock: string, inventoryPosition: string, unit: string): string {
  const need = millis(maxStock) - millis(inventoryPosition);
  if (need <= 0n) return "0.000";
  if (["pcs", "count"].includes(unit.toLowerCase())) return decimal(((need + 999n) / 1000n) * 1000n);
  return decimal(need);
}

export function allocateSupply(suggestedQty: string, internalAvailable: string | null, unit = "kg"): { internalQty: string; externalQty: string } {
  if (internalAvailable === null) throw new HttpError(409, "Internal source availability cannot be determined safely");
  const need = millis(suggestedQty);
  const rawAvailable = millis(internalAvailable);
  const available = ["pcs", "count"].includes(unit.toLowerCase()) ? (rawAvailable / 1000n) * 1000n : rawAvailable;
  if (need < 0n || available < 0n) throw new HttpError(500, "Invalid saved supply quantity");
  const internal = need < available ? need : available;
  return { internalQty: decimal(internal), externalQty: decimal(need - internal) };
}

export function supplyPositionFingerprint(input: Record<string, string>): string {
  const canonical = Object.keys(input).sort().map((key) => `${key}=${input[key]}`).join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}
