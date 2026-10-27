import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { bomRecipes, menuItems, rawMaterials } from "../../db/schema/menu";
import { inventoryStock } from "../../db/schema/inventory";
import { semiFgProductions, semiFgStock, type ProductionSnapshot } from "../../db/schema/production";
import type { Executor } from "./auth";
import { HttpError } from "./permissions";
import { assertProductionItem, productionInput } from "./production-policy";
import { decimal, directRequirements, MAX_QUANTITY, quantity, type Requirements } from "./production-quantity";

// All recipe writers, production and POS must acquire this BEFORE reading a
// recipe. Row locks + guarded SQL additionally protect stock from other writers.
export async function lockRecipeStock(tx: Executor, branchId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'recipe-stock:' + branchId}))`);
}
export async function readStockRecipe(tx: Executor, branchId: string, menuItemIds: string[]) {
  return tx.select().from(bomRecipes).where(and(eq(bomRecipes.branchId, branchId), inArray(bomRecipes.menuItemId, menuItemIds)));
}

export async function deductStock(tx: Executor, branchId: string, required: Requirements) {
  const rawIds = [...required.raw.keys()].sort(), semiIds = [...required.semiFg.keys()].sort();
  // Validate the direct Semi-FG component catalog. Never inspect its embedded
  // recipe or silently substitute raw materials when its stock is missing.
  if (semiIds.length) {
    const components = await tx.select().from(menuItems).where(inArray(menuItems.id, semiIds));
    const byId = new Map(components.map(item => [item.id, item]));
    for (const id of semiIds) assertProductionItem(byId.get(id), branchId);
  }
  const rawRows = rawIds.length ? await tx.select().from(inventoryStock).where(and(eq(inventoryStock.branchId, branchId), inArray(inventoryStock.rawMaterialId, rawIds))).orderBy(asc(inventoryStock.rawMaterialId), asc(inventoryStock.id)).for("update") : [];
  const semiRows = semiIds.length ? await tx.select().from(semiFgStock).where(and(eq(semiFgStock.branchId, branchId), inArray(semiFgStock.menuItemId, semiIds))).orderBy(asc(semiFgStock.menuItemId)).for("update") : [];
  const rawById = new Map(rawRows.map(row => [row.rawMaterialId, row]));
  const semiById = new Map(semiRows.map(row => [row.menuItemId, row]));
  // Legacy inventory_stock has no unique constraint. Fail closed rather than
  // picking an arbitrary duplicate row and corrupting the branch stock total.
  if (rawById.size !== rawRows.length) throw new HttpError(409, "Duplicate raw stock rows; reconcile inventory first");
  for (const id of rawIds) {
    const row = rawById.get(id), needed = required.raw.get(id)!;
    if (!row || quantity(row.qtyOnHand, true) < needed) throw new HttpError(409, `Insufficient raw stock: ${id} needs ${decimal(needed)}, has ${row?.qtyOnHand ?? "0.000"}`);
  }
  for (const id of semiIds) {
    const row = semiById.get(id), needed = required.semiFg.get(id)!;
    if (!row || quantity(row.qtyOnHand, true) < needed) throw new HttpError(409, `Insufficient Semi-FG stock: ${id} needs ${decimal(needed)}, has ${row?.qtyOnHand ?? "0.000"}. Produce it first.`);
  }
  for (const id of rawIds) {
    const amount = decimal(required.raw.get(id)!);
    const changed = await tx.update(inventoryStock).set({ qtyOnHand: sql`${inventoryStock.qtyOnHand} - ${amount}::numeric`, updatedAt: new Date() }).where(and(eq(inventoryStock.id, rawById.get(id)!.id), eq(inventoryStock.branchId, branchId), gte(inventoryStock.qtyOnHand, amount))).returning({ id: inventoryStock.id });
    if (!changed.length) throw new HttpError(409, "Raw stock changed; retry");
  }
  for (const id of semiIds) {
    const amount = decimal(required.semiFg.get(id)!);
    const changed = await tx.update(semiFgStock).set({ qtyOnHand: sql`${semiFgStock.qtyOnHand} - ${amount}::numeric`, updatedAt: new Date() }).where(and(eq(semiFgStock.id, semiById.get(id)!.id), eq(semiFgStock.branchId, branchId), gte(semiFgStock.qtyOnHand, amount))).returning({ id: semiFgStock.id });
    if (!changed.length) throw new HttpError(409, "Semi-FG stock changed; retry");
  }
  return {
    inventoryDeducted: rawIds.map(rawMaterialId => ({ rawMaterialId, qtyDeducted: decimal(required.raw.get(rawMaterialId)!) })),
    semiFgDeducted: semiIds.map(menuItemId => ({ menuItemId, qtyDeducted: decimal(required.semiFg.get(menuItemId)!) })),
  };
}

export async function produceSemiFg(tx: Executor, actorId: string, branchId: string, input: Record<string, unknown>) {
  const parsed = productionInput(input);
  await lockRecipeStock(tx, branchId);
  const [existing] = await tx.select().from(semiFgProductions).where(and(eq(semiFgProductions.branchId, branchId), eq(semiFgProductions.idempotencyKey, parsed.idempotencyKey))).limit(1);
  if (existing) {
    if (existing.menuItemId !== parsed.menuItemId || quantity(existing.quantity) !== quantity(parsed.quantity)) throw new HttpError(409, "Idempotency key already used with different production input");
    return { production: existing, replayed: true };
  }
  const [item] = await tx.select().from(menuItems).where(eq(menuItems.id, parsed.menuItemId)).limit(1);
  assertProductionItem(item, branchId);
  const recipe = await readStockRecipe(tx, branchId, [item.id]);
  const required = directRequirements(branchId, recipe, [{ menuItemId: item.id, quantity: parsed.quantity }]);
  const deductions = await deductStock(tx, branchId, required);
  const rawIds = [...required.raw.keys()], semiIds = [...required.semiFg.keys()];
  const raws = rawIds.length ? await tx.select().from(rawMaterials).where(inArray(rawMaterials.id, rawIds)) : [];
  const semis = semiIds.length ? await tx.select().from(menuItems).where(inArray(menuItems.id, semiIds)) : [];
  const rawById = new Map(raws.map(row => [row.id, row]));
  const semiById = new Map(semis.map(row => [row.id, row]));
  const snapshot: ProductionSnapshot = {
    name: item.name, unit: item.outputUnit, quantity: parsed.quantity,
    recipe: recipe.map(row => {
      const component = row.rawMaterialId ? rawById.get(row.rawMaterialId) : semiById.get(row.componentMenuItemId!);
      if (!component) throw new HttpError(409, "Recipe component no longer exists");
      return { id: row.id, componentType: row.componentType, rawMaterialId: row.rawMaterialId, componentMenuItemId: row.componentMenuItemId, qtyPerUnit: row.qtyPerUnit, name: component.name, unit: "unit" in component ? component.unit : component.outputUnit };
    }),
    ...deductions,
  };
  await tx.insert(semiFgStock).values({ id: randomUUID(), branchId, menuItemId: item.id, qtyOnHand: "0.000" }).onConflictDoNothing({ target: [semiFgStock.branchId, semiFgStock.menuItemId] });
  const changed = await tx.update(semiFgStock).set({ qtyOnHand: sql`${semiFgStock.qtyOnHand} + ${parsed.quantity}::numeric`, updatedAt: new Date() }).where(and(eq(semiFgStock.branchId, branchId), eq(semiFgStock.menuItemId, item.id), lte(semiFgStock.qtyOnHand, decimal(MAX_QUANTITY - quantity(parsed.quantity))))).returning({ qtyOnHand: semiFgStock.qtyOnHand });
  if (!changed.length) throw new HttpError(409, "Semi-FG stock capacity exceeded");
  const [production] = await tx.insert(semiFgProductions).values({ id: randomUUID(), branchId, menuItemId: item.id, quantity: parsed.quantity, idempotencyKey: parsed.idempotencyKey, snapshot, producedById: actorId }).returning();
  return { production, replayed: false };
}
