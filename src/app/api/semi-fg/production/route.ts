import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { menuItems } from "@/db/schema/menu";
import { semiFgProductions, semiFgStock } from "@/db/schema/production";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { produceSemiFg } from "@/lib/server/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "MENU_BOM");
    const branchId = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    if (!branchId) throw new HttpError(400, "Select a branch");
    const stock = await db.select({ menuItemId: menuItems.id, name: menuItems.name, unit: menuItems.outputUnit, qtyOnHand: sql<string>`coalesce(${semiFgStock.qtyOnHand}, 0)::numeric(12,3)::text` })
      .from(menuItems).leftJoin(semiFgStock, and(eq(semiFgStock.branchId, menuItems.branchId), eq(semiFgStock.menuItemId, menuItems.id)))
      .where(and(eq(menuItems.branchId, branchId), eq(menuItems.isSemiFg, true))).orderBy(asc(menuItems.name), asc(menuItems.id));
    const productions = await db.select().from(semiFgProductions).where(eq(semiFgProductions.branchId, branchId)).orderBy(desc(semiFgProductions.createdAt), desc(semiFgProductions.id)).limit(100);
    return json({ stock, productions });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "MENU_BOM");
      const input = await body(request);
      if (input.branchId !== undefined && (typeof input.branchId !== "string" || !input.branchId)) throw new HttpError(400, "Invalid branchId");
      const branchId = branchScope(actor, input.branchId as string | undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      return produceSemiFg(tx, actor.id, branchId, input);
    });
    return json(result, result.replayed ? 200 : 201);
  });
}
