import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuItems } from "@/db/schema/menu";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, numeric, string } from "@/lib/server/http";
import { assertModule, branchScope, hasModule, HttpError } from "@/lib/server/permissions";
import { lockRecipeBranch, OUTPUT_UNITS, replaceRecipe } from "@/lib/server/recipe-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = {
  id: menuItems.id,
  branchId: menuItems.branchId,
  name: menuItems.name,
  category: menuItems.category,
  price: menuItems.price,
  isActive: menuItems.isActive,
  isSemiFg: menuItems.isSemiFg,
  isSellable: menuItems.isSellable,
  outputUnit: menuItems.outputUnit,
  createdAt: menuItems.createdAt,
};

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    const recipeAccess = hasModule(actor, "MENU_BOM");
    // Billing needs sellable menu options, not recipe-edit authority. POST
    // remains MENU_BOM-only; cashier reads never expose inactive/Semi-FG rows.
    if (!recipeAccess) assertModule(actor, "POS_CASHIER");
    const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const items = await db
      .select(columns)
      .from(menuItems)
      .where(and(scope ? eq(menuItems.branchId, scope) : undefined, recipeAccess ? undefined : and(eq(menuItems.isActive, true), eq(menuItems.isSellable, true))))
      .orderBy(menuItems.name);
    return json({ menuItems: items });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const item = await mutate(request, async (tx, actor) => {
      assertModule(actor, "MENU_BOM");
      const input = await body(request);
      const branchId = branchScope(actor, input.branchId === undefined ? undefined : string(input.branchId, "branchId"));
      if (!branchId) throw new HttpError(400, "Select a branch");
      const name = string(input.name, "name");
      const category = input.category === undefined || input.category === "" ? "" : string(input.category, "category", 80);
      const price = numeric(input.price, "price");
      if (price.split(".")[0].length > 8 || (price.split(".")[1]?.length ?? 0) > 2) throw new HttpError(400, "Price supports at most 8 digits and 2 decimals");
      for (const field of ["isSemiFg", "isSellable"] as const) if (input[field] !== undefined && typeof input[field] !== "boolean") throw new HttpError(400, `Invalid ${field}`);
      const isSemiFg = input.isSemiFg === undefined ? false : input.isSemiFg as boolean;
      // A Semi-FG base (gravy/sauce/marinade) is not sold directly by default;
      // the caller can still flip isSellable true for a branch that does sell
      // it directly (e.g. a takeaway jar) — see the schema comment in menu.ts.
      const isSellable = input.isSellable === undefined ? !isSemiFg : Boolean(input.isSellable);
      const outputUnit = input.outputUnit === undefined ? "portion" : string(input.outputUnit, "outputUnit", 20);
      if (!(OUTPUT_UNITS as readonly string[]).includes(outputUnit)) throw new HttpError(400, "Invalid output unit");
      await lockRecipeBranch(tx, branchId);
      const id = randomUUID();
      await tx.insert(menuItems).values({ id, branchId, name, category, price, isSemiFg, isSellable, outputUnit });
      if (input.components !== undefined) await replaceRecipe(tx, actor, branchId, id, input.components);
      const [row] = await tx.select(columns).from(menuItems).where(eq(menuItems.id, id));
      return row;
    });
    return json({ menuItem: item }, 201);
  });
}
