import { eq } from "drizzle-orm";
import { posOrders } from "../../db/schema/pos";
import { HttpError, type Identity } from "./permissions";

// Apply at the database read boundary, BEFORE paging/aggregating/returning IDs.
// Official accounting and physical-cash reconciliation deliberately do not use it.
export function operationalOrderVisibility(actor: Identity) {
  return actor.role === "SUPER_ADMIN" ? undefined : eq(posOrders.ownerOnly, false);
}

export function parseVisibilityChange(input: Record<string, unknown>) {
  if (Object.keys(input).some(key => !["ownerOnly", "reason"].includes(key)) || typeof input.ownerOnly !== "boolean") throw new HttpError(400, "ownerOnly must be a boolean; only visibility and reason may be changed");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) throw new HttpError(400, "Visibility reason must be 3-500 characters");
  return { ownerOnly: input.ownerOnly, reason };
}

function paise(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Invalid sales aggregate");
  const [whole, decimal = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
}
function money(value: bigint) { return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`; }
export function salesSummaryFor(actor: Identity, values: { actualTotal: string; visibleTotal: string }) {
  if (actor.role !== "SUPER_ADMIN") return { visibleTotal: values.visibleTotal };
  return { actualTotal: values.actualTotal, visibleTotal: values.visibleTotal, privateTotal: money(paise(values.actualTotal) - paise(values.visibleTotal)) };
}
