import { HttpError } from "./permissions";

// ---------------------------------------------------------------------------
// BOM / Semi-FG explosion engine.
//
// A bom_recipes row's component is EITHER a raw material OR another menu
// item that is itself a Semi-FG (base gravy/sauce/marinade etc) — see the
// schema comment in src/db/schema/menu.ts for the full shape. explodeBom
// walks that tree recursively down to raw-material leaves; computeRecipeCost
// walks the same tree to price a dish. Both guard against a cycle (a dish
// depending on itself, directly or through a chain of semi-FGs) because the
// DB has no portable constraint for that — assertAcyclicInsert below is the
// write-time guard used before a new SEMI_FG row is persisted.
//
// Planned-feature scaffolding: pure functions only, no DB/API wiring yet.
// Costing uses plain floating point rounded to 2dp at the edges — fine for
// an estimate/costing tool, NOT yet the fixed-point precision used by the
// real expense/payroll ledger (src/lib/server/expenses.ts's paise/decimal
// BigInt helpers) because this isn't wired into actual money postings yet.
// Upgrade to the same BigInt-paise pattern before this feeds a real invoice.
// ---------------------------------------------------------------------------

export const BOM_COMPONENT_TYPES = ["RAW_MATERIAL", "SEMI_FG"] as const;
export type BomComponentType = (typeof BOM_COMPONENT_TYPES)[number];

export type BomRow = {
  id: string;
  branchId: string;
  menuItemId: string;
  componentType: BomComponentType;
  rawMaterialId: string | null;
  componentMenuItemId: string | null;
  qtyPerUnit: string; // decimal string, up to 3 decimals, in the component's own UOM
  lockedByHq: boolean;
};

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length > max || value.trim().length < min || /[\u0000-\u001f\u007f]/.test(value))
    throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}

export function parseBomRow(input: Record<string, unknown>) {
  const fields = ["branchId", "menuItemId", "componentType", "rawMaterialId", "componentMenuItemId", "qtyPerUnit", "lockedByHq"];
  if (Object.keys(input).some((key) => !fields.includes(key))) throw new HttpError(400, "Unexpected BOM field");
  const branchId = text(input.branchId, "branchId", 1, 200);
  const menuItemId = text(input.menuItemId, "menuItemId", 1, 200);
  if (!(BOM_COMPONENT_TYPES as readonly unknown[]).includes(input.componentType)) throw new HttpError(400, "Invalid componentType");
  const componentType = input.componentType as BomComponentType;
  const rawMaterialId =
    input.rawMaterialId === undefined || input.rawMaterialId === null ? null : text(input.rawMaterialId, "rawMaterialId", 1, 200);
  const componentMenuItemId =
    input.componentMenuItemId === undefined || input.componentMenuItemId === null
      ? null
      : text(input.componentMenuItemId, "componentMenuItemId", 1, 200);
  if (componentType === "RAW_MATERIAL") {
    if (!rawMaterialId || componentMenuItemId) throw new HttpError(400, "RAW_MATERIAL component needs rawMaterialId only");
  } else {
    if (!componentMenuItemId || rawMaterialId) throw new HttpError(400, "SEMI_FG component needs componentMenuItemId only");
    if (componentMenuItemId === menuItemId) throw new HttpError(409, "A dish cannot use itself as a Semi-FG component");
  }
  if (typeof input.qtyPerUnit !== "string" || !/^\d{1,6}(\.\d{1,3})?$/.test(input.qtyPerUnit))
    throw new HttpError(400, "Invalid qtyPerUnit (max 3 decimals)");
  if (!(Number(input.qtyPerUnit) > 0)) throw new HttpError(400, "qtyPerUnit must be positive");
  const lockedByHq = input.lockedByHq === undefined ? true : Boolean(input.lockedByHq);
  return { branchId, menuItemId, componentType, rawMaterialId, componentMenuItemId, qtyPerUnit: input.qtyPerUnit, lockedByHq };
}

export function buildRecipeIndex(rows: BomRow[]): Map<string, BomRow[]> {
  const index = new Map<string, BomRow[]>();
  for (const row of rows) {
    const list = index.get(row.menuItemId) ?? [];
    list.push(row);
    index.set(row.menuItemId, list);
  }
  return index;
}

// Write-time cycle guard: call before persisting a new/edited SEMI_FG row
// that makes `componentMenuItemId` a dependency of `menuItemId`. Throws if
// menuItemId is already reachable FROM componentMenuItemId in the existing
// recipe graph (which would close a cycle once this row is added).
export function assertAcyclicInsert(menuItemId: string, componentMenuItemId: string, recipeIndex: Map<string, BomRow[]>) {
  if (menuItemId === componentMenuItemId) throw new HttpError(409, "A dish cannot use itself as a Semi-FG component");
  const visited = new Set<string>();
  const stack = [componentMenuItemId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === menuItemId) throw new HttpError(409, "Adding this Semi-FG would create a circular BOM reference");
    if (visited.has(current)) continue;
    visited.add(current);
    for (const row of recipeIndex.get(current) ?? [])
      if (row.componentType === "SEMI_FG" && row.componentMenuItemId) stack.push(row.componentMenuItemId);
  }
}

const MAX_BOM_DEPTH = 12; // generous ceiling for a real kitchen recipe tree; guards runaway recursion on bad data

function cyclePath(ancestry: string[], menuItemId: string) {
  return [...ancestry, menuItemId].join(" -> ");
}

// Explodes `qty` units of `menuItemId` down to raw-material leaf quantities,
// recursing through any Semi-FG components. Returns rawMaterialId -> total qty
// (in that raw material's own UOM).
export function explodeBom(
  menuItemId: string,
  qty: number,
  recipeIndex: Map<string, BomRow[]>,
  ancestry: string[] = []
): Map<string, number> {
  if (ancestry.includes(menuItemId)) throw new HttpError(409, `Circular BOM reference detected: ${cyclePath(ancestry, menuItemId)}`);
  if (ancestry.length >= MAX_BOM_DEPTH) throw new HttpError(409, `BOM nesting too deep: ${cyclePath(ancestry, menuItemId)}`);
  const totals = new Map<string, number>();
  for (const row of recipeIndex.get(menuItemId) ?? []) {
    const rowQty = Number(row.qtyPerUnit) * qty;
    if (row.componentType === "RAW_MATERIAL") {
      if (!row.rawMaterialId) throw new HttpError(400, "RAW_MATERIAL component missing rawMaterialId");
      totals.set(row.rawMaterialId, (totals.get(row.rawMaterialId) ?? 0) + rowQty);
    } else {
      if (!row.componentMenuItemId) throw new HttpError(400, "SEMI_FG component missing componentMenuItemId");
      const nested = explodeBom(row.componentMenuItemId, rowQty, recipeIndex, [...ancestry, menuItemId]);
      for (const [rawId, nestedQty] of nested) totals.set(rawId, (totals.get(rawId) ?? 0) + nestedQty);
    }
  }
  return totals;
}

// Prices 1 unit of menuItemId by walking the same recipe tree, using a flat
// rawMaterialId -> cost-per-unit map (cost in the raw material's own UOM).
export function computeRecipeCost(
  menuItemId: string,
  recipeIndex: Map<string, BomRow[]>,
  rawMaterialCost: Map<string, number>,
  ancestry: string[] = []
): number {
  if (ancestry.includes(menuItemId)) throw new HttpError(409, `Circular BOM reference detected: ${cyclePath(ancestry, menuItemId)}`);
  if (ancestry.length >= MAX_BOM_DEPTH) throw new HttpError(409, `BOM nesting too deep: ${cyclePath(ancestry, menuItemId)}`);
  let total = 0;
  for (const row of recipeIndex.get(menuItemId) ?? []) {
    const rowQty = Number(row.qtyPerUnit);
    if (row.componentType === "RAW_MATERIAL") {
      if (!row.rawMaterialId) throw new HttpError(400, "RAW_MATERIAL component missing rawMaterialId");
      const unitCost = rawMaterialCost.get(row.rawMaterialId);
      if (unitCost === undefined) throw new HttpError(400, `Missing cost for raw material ${row.rawMaterialId}`);
      total += rowQty * unitCost;
    } else {
      if (!row.componentMenuItemId) throw new HttpError(400, "SEMI_FG component missing componentMenuItemId");
      total += rowQty * computeRecipeCost(row.componentMenuItemId, recipeIndex, rawMaterialCost, [...ancestry, menuItemId]);
    }
  }
  return Math.round(total * 100) / 100;
}
