import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { branches } from "@/db/schema/platform";
import { bomRecipes, menuItems } from "@/db/schema/menu";
import { checklistTemplates } from "@/db/schema/tasks";
import type { Executor } from "./auth";
import { branchInput } from "./branches";
import { string } from "./http";
import { assertOwner, HttpError, type Identity } from "./permissions";

/**
 * Clone Branch Wizard — UX-1c. Creates a new branch row (own code/name/
 * address/geofence, never copied) and, in the SAME transaction the caller
 * already holds (mutate()'s advisory lock), copies menuItems/bomRecipes/
 * checklistTemplates from one existing source branch. Explicitly NOT
 * copied: inventory stock/levels, vendor rates, users, recurring task
 * definitions/instances, POS orders, any other transactional/historical
 * data — see docs/clone-branch-wizard-contract.md.
 *
 * Caller owns the transaction/lock (same convention as branches.ts POST);
 * this helper never opens its own transaction, so a failure anywhere here
 * (including a duplicate branch code 23505) rolls back everything already
 * written in this call — no new branch with zero/partial copied data.
 */
export async function cloneBranch(tx: Executor, actor: Identity, input: Record<string, unknown>) {
  assertOwner(actor);
  const sourceBranchId = string(input.sourceBranchId, "sourceBranchId", 200);
  const fields = branchInput(input);

  const [source] = await tx
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.id, sourceBranchId))
    .limit(1);
  if (!source) throw new HttpError(404, "Source branch not found");

  const [branch] = await tx
    .insert(branches)
    .values({ id: randomUUID(), ...fields, isTemplate: false, clonedFromId: sourceBranchId })
    .returning();

  // menuItems: new ids under the new branch, same name/price/outputUnit/active flag.
  const sourceMenuItems = await tx.select().from(menuItems).where(eq(menuItems.branchId, sourceBranchId));
  const menuItemIdMap = new Map<string, string>();
  for (const item of sourceMenuItems) menuItemIdMap.set(item.id, randomUUID());
  if (sourceMenuItems.length) {
    await tx.insert(menuItems).values(
      sourceMenuItems.map((item) => ({
        id: menuItemIdMap.get(item.id)!,
        branchId: branch.id,
        name: item.name,
        category: item.category,
        outputUnit: item.outputUnit,
        price: item.price,
        isActive: item.isActive,
        isSemiFg: item.isSemiFg,
        isSellable: item.isSellable,
        productCode: item.productCode,
        vatRatePercent: item.vatRatePercent,
      }))
    );
  }

  // bomRecipes: lockedByHq preserved exactly from source. Component
  // references are rewired to the NEW branch's copied rows — rawMaterialId
  // is untouched (raw materials are global, not branch-scoped), but a
  // SEMI_FG componentMenuItemId must point at the copied menu item row in
  // the new branch, never at the source branch's row.
  const sourceBomRecipes = sourceMenuItems.length
    ? await tx.select().from(bomRecipes).where(eq(bomRecipes.branchId, sourceBranchId))
    : [];
  const relevantBomRecipes = sourceBomRecipes.filter((recipe) => menuItemIdMap.has(recipe.menuItemId));
  if (relevantBomRecipes.length) {
    await tx.insert(bomRecipes).values(
      relevantBomRecipes.map((recipe) => {
        let componentMenuItemId: string | null = null;
        if (recipe.componentType === "SEMI_FG") {
          const mapped = recipe.componentMenuItemId ? menuItemIdMap.get(recipe.componentMenuItemId) : undefined;
          if (!mapped) throw new HttpError(500, "Cannot clone a recipe whose Semi-FG component is outside the source branch");
          componentMenuItemId = mapped;
        }
        return {
          id: randomUUID(),
          branchId: branch.id,
          menuItemId: menuItemIdMap.get(recipe.menuItemId)!,
          componentType: recipe.componentType,
          rawMaterialId: recipe.componentType === "RAW_MATERIAL" ? recipe.rawMaterialId : null,
          componentMenuItemId,
          qtyPerUnit: recipe.qtyPerUnit,
          lockedByHq: recipe.lockedByHq,
        };
      })
    );
  }

  // checklistTemplates: only branch-scoped rows (branchId not null) are
  // copied; global (branchId null) templates already apply to every
  // branch and are left untouched. Same step chain/nextStepMap preserved
  // — nextStepMap values are step numbers within the same template, which
  // stay valid once copied, so only templateId itself needs remapping.
  const sourceChecklistTemplates = await tx
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.branchId, sourceBranchId));
  const templateIdMap = new Map<string, string>();
  for (const row of sourceChecklistTemplates) {
    if (!templateIdMap.has(row.templateId)) templateIdMap.set(row.templateId, randomUUID());
  }
  if (sourceChecklistTemplates.length) {
    await tx.insert(checklistTemplates).values(
      sourceChecklistTemplates.map((row) => ({
        templateId: templateIdMap.get(row.templateId)!,
        branchId: branch.id,
        templateName: row.templateName,
        triggerEvent: row.triggerEvent,
        status: row.status,
        stepNo: row.stepNo,
        stepName: row.stepName,
        assignedToRole: row.assignedToRole,
        tatValue: row.tatValue,
        tatUnit: row.tatUnit,
        outcomeOptions: row.outcomeOptions,
        nextStepMap: row.nextStepMap,
        outcomeType: row.outcomeType,
        requiresPhoto: row.requiresPhoto,
        requiresGeofence: row.requiresGeofence,
        notifyOnComplete: row.notifyOnComplete,
        createdBy: row.createdBy,
      }))
    );
  }

  return {
    branch,
    copied: {
      menuItems: sourceMenuItems.length,
      bomRecipes: relevantBomRecipes.length,
      checklistTemplates: sourceChecklistTemplates.length,
    },
  };
}
