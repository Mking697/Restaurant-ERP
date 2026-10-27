export type ComponentType = "RAW_MATERIAL" | "SEMI_FG";
export interface MenuItemRow { id: string; branchId: string; name: string; category: string; price: string; outputUnit: string; isActive: boolean; isSemiFg: boolean; isSellable: boolean; }
export interface RawMaterialRow { id: string; name: string; unit: string; category: string; }
export interface BomRow { id: string; branchId: string; menuItemId: string; componentType: ComponentType; rawMaterialId: string | null; componentMenuItemId: string | null; qtyPerUnit: string; lockedByHq: boolean; }
export interface IngredientDraft { key: string; componentType: ComponentType; componentId: string; quantity: string; search: string; locked: boolean; }
export function normalizeQuantity(quantity: string, recipeYield: string): string {
  const decimal = (value: string) => {
    if (!/^\d{1,9}(\.\d{1,6})?$/.test(value)) throw new Error("Use a positive decimal quantity (up to 6 decimal places).");
    const [whole, fraction = ""] = value.split(".");
    const result = BigInt(whole + fraction.padEnd(6, "0"));
    if (result <= 0n) throw new Error("Quantity and recipe yield must be greater than zero.");
    return result;
  };
  const numerator = decimal(quantity) * 1000n;
  const denominator = decimal(recipeYield);
  const rounded = (numerator * 2n + denominator) / (2n * denominator);
  if (rounded < 1n || rounded > 999999999n) throw new Error("Quantity per output unit must be between 0.001 and 999999.999. Adjust the batch yield.");
  return `${rounded / 1000n}.${(rounded % 1000n).toString().padStart(3, "0")}`.replace(/\.?0+$/, "");
}
export function eligibleSemiFg(items: MenuItemRow[], branchId: string, excludeId = "") {
  return items.filter(item => item.branchId === branchId && item.isActive && item.isSemiFg && item.id !== excludeId);
}
export function recipeComponents(rows: IngredientDraft[], recipeYield: string) {
  if (!rows.length) throw new Error("Add at least one ingredient.");
  const seen = new Set<string>();
  return rows.map(row => {
    if (!row.componentId) throw new Error("Select an ingredient in every row.");
    const key = `${row.componentType}:${row.componentId}`;
    if (seen.has(key)) throw new Error("Each ingredient can appear only once. Combine its quantities.");
    seen.add(key);
    return { componentType: row.componentType, rawMaterialId: row.componentType === "RAW_MATERIAL" ? row.componentId : null, componentMenuItemId: row.componentType === "SEMI_FG" ? row.componentId : null, qtyPerUnit: normalizeQuantity(row.quantity, recipeYield) };
  });
}
export function foodCostPercent(cost: number | null, price: string, quantity: string): number | null {
  const revenue = Number(price) * Number(quantity);
  return cost !== null && Number.isFinite(cost) && revenue > 0 && Number.isFinite(revenue) ? cost / revenue * 100 : null;
}
export interface ProductionIntent { branchId: string; menuItemId: string; quantity: string; idempotencyKey: string; }
export function isProductionIntent(value: unknown, branchId: string): value is ProductionIntent {
  if (!value || typeof value !== "object") return false;
  const row = value as ProductionIntent;
  return row.branchId === branchId && typeof row.menuItemId === "string" && !!row.menuItemId && typeof row.quantity === "string" && /^\d{1,6}(\.\d{1,3})?$/.test(row.quantity) && Number(row.quantity) > 0 && typeof row.idempotencyKey === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(row.idempotencyKey);
}
