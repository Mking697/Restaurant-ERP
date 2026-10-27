import { HttpError } from "./permissions";
import { decimal, quantity } from "./production-quantity";

function identifier(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new HttpError(400, `Invalid ${field}`);
  return value;
}
export function productionInput(input: Record<string, unknown>) {
  return {
    menuItemId: identifier(input.menuItemId, "menuItemId", 200),
    quantity: decimal(quantity(input.quantity)),
    idempotencyKey: identifier(input.idempotencyKey, "idempotencyKey", 128),
  };
}
export function assertProductionItem(item: { branchId: string; isActive: boolean; isSemiFg: boolean } | undefined, branchId: string): asserts item is { branchId: string; isActive: boolean; isSemiFg: boolean } {
  if (!item || item.branchId !== branchId) throw new HttpError(400, "Semi-FG item not found in this branch");
  if (!item.isActive || !item.isSemiFg) throw new HttpError(400, "Production requires an active Semi-FG item");
}
