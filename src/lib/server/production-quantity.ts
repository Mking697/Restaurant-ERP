import { HttpError } from "./permissions";

// Inventory is stored to 3 decimals. Never use floating-point math for stock.
export const MAX_QUANTITY = 999999999999n;
export function quantity(value: unknown, allowZero = false): bigint {
  if (typeof value !== "string" || !/^\d{1,9}(\.\d{1,3})?$/.test(value)) throw new HttpError(400, "Invalid quantity (decimal string, up to 3 decimal places)");
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if ((!allowZero && result === 0n) || result > MAX_QUANTITY) throw new HttpError(400, "Quantity must be positive and fit numeric(12,3)");
  return result;
}
export function decimal(value: bigint): string {
  return `${value / 1000n}.${(value % 1000n).toString().padStart(3, "0")}`;
}
export interface StockRecipeRow {
  id: string; branchId: string; menuItemId: string; componentType: string;
  rawMaterialId: string | null; componentMenuItemId: string | null; qtyPerUnit: string;
}
export interface Requirements { raw: Map<string, bigint>; semiFg: Map<string, bigint>; }
export function directRequirements(branchId: string, rows: StockRecipeRow[], demands: { menuItemId: string; quantity: string }[]): Requirements {
  const raw = new Map<string, bigint>(), semiFg = new Map<string, bigint>();
  for (const demand of demands) {
    const output = quantity(demand.quantity);
    const recipe = rows.filter(row => row.menuItemId === demand.menuItemId);
    if (!recipe.length) throw new HttpError(409, `Missing recipe for ${demand.menuItemId}`);
    for (const row of recipe) {
      if (row.branchId !== branchId) throw new HttpError(409, "Recipe branch mismatch");
      const isRaw = row.componentType === "RAW_MATERIAL" && !!row.rawMaterialId && !row.componentMenuItemId;
      const isSemi = row.componentType === "SEMI_FG" && !!row.componentMenuItemId && !row.rawMaterialId && row.componentMenuItemId !== row.menuItemId;
      if (!isRaw && !isSemi) throw new HttpError(409, "Invalid recipe component");
      const amount = quantity(row.qtyPerUnit) * output; // exact millionths
      const map = isRaw ? raw : semiFg;
      const id = (isRaw ? row.rawMaterialId : row.componentMenuItemId)!;
      map.set(id, (map.get(id) ?? 0n) + amount);
    }
  }
  // Aggregate exact consumption first; round UP once per stock item so small
  // fractional batches cannot consume zero stock. Never round production output.
  for (const map of [raw, semiFg]) for (const [id, value] of map) {
    const rounded = (value + 999n) / 1000n;
    if (rounded > MAX_QUANTITY) throw new HttpError(409, "Required stock quantity exceeds capacity");
    map.set(id, rounded);
  }
  return { raw, semiFg };
}
