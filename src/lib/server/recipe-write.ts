import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { bomRecipes, menuItems, rawMaterials } from "@/db/schema/menu";
import type { Executor } from "./auth";
import { assertAcyclicInsert, buildRecipeIndex, parseComponents, type BomRow } from "./bom";
import { HttpError, type Identity } from "./permissions";

export const OUTPUT_UNITS = ["portion", "kg", "g", "ltr", "ml", "pcs"] as const;

// Every recipe write uses the same lock order as production and order posting.
// mutate() has already resolved live identity under the global auth lock.
export async function lockRecipeBranch(tx: Executor, branchId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'recipe-stock:' + branchId}))`);
}

export async function replaceRecipe(tx: Executor, actor: Identity, branchId: string, menuItemId: string, components: unknown) {
  const parsed = parseComponents(components, branchId, menuItemId);
  const existing = await tx.select().from(bomRecipes).where(eq(bomRecipes.branchId, branchId));
  const ownRows = existing.filter((row) => row.menuItemId === menuItemId);
  const preservedIds = new Map<string, { id: string; lockedByHq: boolean }>();
  const key = (row: { componentType: string; rawMaterialId: string | null; componentMenuItemId: string | null }) => `${row.componentType}:${row.rawMaterialId ?? row.componentMenuItemId}`;
  for (const row of ownRows) {
    const next = parsed.find((candidate) => key(candidate) === key(row));
    if (actor.role !== "SUPER_ADMIN" && row.lockedByHq && (!next || Number(next.qtyPerUnit) !== Number(row.qtyPerUnit)))
      throw new HttpError(403, "This recipe contains HQ-locked ingredients; only the Owner can change or remove them");
    if (next) preservedIds.set(key(next), { id: row.id, lockedByHq: row.lockedByHq });
  }
  const materialIds = parsed.filter((row) => row.rawMaterialId).map((row) => row.rawMaterialId!);
  const validMaterials = materialIds.length ? await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(inArray(rawMaterials.id, materialIds)) : [];
  if (validMaterials.length !== materialIds.length) throw new HttpError(400, "Raw material not found");
  const semiIds = parsed.filter((row) => row.componentMenuItemId).map((row) => row.componentMenuItemId!);
  const semiItems = semiIds.length ? await tx.select().from(menuItems).where(inArray(menuItems.id, semiIds)) : [];
  for (const id of semiIds) {
    const item = semiItems.find((candidate) => candidate.id === id);
    if (!item || item.branchId !== branchId || !item.isSemiFg || !item.isActive)
      throw new HttpError(400, "Semi-FG ingredient must be active and belong to the same branch");
    if (!existing.some((row) => row.menuItemId === id)) throw new HttpError(409, `Save a recipe for ${item.name} before using it as an ingredient`);
  }
  const replacement = parsed.map((row) => ({ ...row, id: preservedIds.get(key(row))?.id ?? randomUUID(), lockedByHq: preservedIds.get(key(row))?.lockedByHq ?? actor.role === "SUPER_ADMIN" }));
  const graph = buildRecipeIndex([...existing.filter((row) => row.menuItemId !== menuItemId), ...replacement] as BomRow[]);
  for (const row of replacement) if (row.componentMenuItemId) assertAcyclicInsert(menuItemId, row.componentMenuItemId, graph);
  await tx.delete(bomRecipes).where(and(eq(bomRecipes.branchId, branchId), eq(bomRecipes.menuItemId, menuItemId)));
  await tx.insert(bomRecipes).values(replacement);
  return replacement;
}
