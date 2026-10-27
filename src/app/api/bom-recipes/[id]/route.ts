import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomRecipes } from "@/db/schema/menu";
import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    await mutate(request, async (tx, actor) => {
      assertModule(actor, "MENU_BOM");
      const [row] = await tx.select().from(bomRecipes).where(eq(bomRecipes.id, id)).limit(1);
      if (!row) throw new HttpError(404, "BOM row not found");
      branchScope(actor, row.branchId);
      if (row.lockedByHq && actor.role !== "SUPER_ADMIN") throw new HttpError(403, "This component is HQ-locked");
      await tx.delete(bomRecipes).where(eq(bomRecipes.id, id));
    });
    return json({ deleted: true });
  });
}
