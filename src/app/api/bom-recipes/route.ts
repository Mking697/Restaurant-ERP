import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomRecipes, menuItems, rawMaterials } from "@/db/schema/menu";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { assertAcyclicInsert, buildRecipeIndex, parseBomRow, type BomRow } from "@/lib/server/bom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = {
  id: bomRecipes.id,
  branchId: bomRecipes.branchId,
  menuItemId: bomRecipes.menuItemId,
  componentType: bomRecipes.componentType,
  rawMaterialId: bomRecipes.rawMaterialId,
  componentMenuItemId: bomRecipes.componentMenuItemId,
  qtyPerUnit: bomRecipes.qtyPerUnit,
  lockedByHq: bomRecipes.lockedByHq,
  updatedAt: bomRecipes.updatedAt,
};

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "MENU_BOM");
    const menuItemId = new URL(request.url).searchParams.get("menuItemId");
    if (!menuItemId) throw new HttpError(400, "menuItemId is required");
    const [item] = await db.select({ branchId: menuItems.branchId }).from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
    if (!item) throw new HttpError(404, "Menu item not found");
    branchScope(actor, item.branchId);
    const rows = await db.select(columns).from(bomRecipes).where(eq(bomRecipes.menuItemId, menuItemId)).orderBy(bomRecipes.updatedAt);
    return json({ bomRecipes: rows });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const row = await mutate(request, async (tx, actor) => {
      assertModule(actor, "MENU_BOM");
      const input = parseBomRow(await body(request));
      const [item] = await tx.select({ branchId: menuItems.branchId, isSemiFg: menuItems.isSemiFg }).from(menuItems).where(eq(menuItems.id, input.menuItemId)).limit(1);
      if (!item) throw new HttpError(400, "Menu item not found");
      const branchId = branchScope(actor, item.branchId);
      if (!branchId) throw new HttpError(400, "Select a branch");
      if (input.branchId !== branchId) throw new HttpError(400, "branchId must match the menu item's branch");
      // Non-owner authors can never author an HQ-locked row, and can never
      // edit/delete an existing one (checked on DELETE) — only SUPER_ADMIN
      // sets lockedByHq true for a new row.
      const lockedByHq = actor.role === "SUPER_ADMIN" ? input.lockedByHq : false;

      if (input.componentType === "RAW_MATERIAL") {
        if (!(await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.id, input.rawMaterialId!)).limit(1)).length)
          throw new HttpError(400, "Raw material not found");
      } else {
        const [component] = await tx
          .select({ id: menuItems.id, branchId: menuItems.branchId, isSemiFg: menuItems.isSemiFg })
          .from(menuItems)
          .where(eq(menuItems.id, input.componentMenuItemId!))
          .limit(1);
        if (!component) throw new HttpError(400, "Semi-FG component menu item not found");
        if (component.branchId !== branchId) throw new HttpError(400, "Semi-FG component must be in the same branch");
        if (!component.isSemiFg) throw new HttpError(400, "Component menu item is not marked as Semi-FG");
        const existingRows = (await tx.select(columns).from(bomRecipes).where(eq(bomRecipes.branchId, branchId))) as BomRow[];
        const index = buildRecipeIndex(existingRows);
        assertAcyclicInsert(input.menuItemId, input.componentMenuItemId!, index);
      }

      if (
        (
          await tx
            .select({ id: bomRecipes.id })
            .from(bomRecipes)
            .where(
              and(
                eq(bomRecipes.branchId, branchId),
                eq(bomRecipes.menuItemId, input.menuItemId),
                input.componentType === "RAW_MATERIAL"
                  ? eq(bomRecipes.rawMaterialId, input.rawMaterialId!)
                  : eq(bomRecipes.componentMenuItemId, input.componentMenuItemId!)
              )
            )
            .limit(1)
        ).length
      )
        throw new HttpError(409, "This component is already in the recipe — edit its quantity instead");

      const id = randomUUID();
      await tx.insert(bomRecipes).values({
        id,
        branchId,
        menuItemId: input.menuItemId,
        componentType: input.componentType,
        rawMaterialId: input.rawMaterialId,
        componentMenuItemId: input.componentMenuItemId,
        qtyPerUnit: input.qtyPerUnit,
        lockedByHq,
      });
      const [created] = await tx.select(columns).from(bomRecipes).where(eq(bomRecipes.id, id));
      return created;
    });
    return json({ bomRecipe: row }, 201);
  });
}
