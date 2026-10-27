import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuItems } from "@/db/schema/menu";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, numeric, string } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";

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
  createdAt: menuItems.createdAt,
};

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "MENU_BOM");
    const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const items = await db
      .select(columns)
      .from(menuItems)
      .where(scope ? eq(menuItems.branchId, scope) : undefined)
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
      const category = input.category === undefined ? "" : string(input.category, "category", 80);
      const price = numeric(input.price, "price");
      const isSemiFg = input.isSemiFg === undefined ? false : Boolean(input.isSemiFg);
      // A Semi-FG base (gravy/sauce/marinade) is not sold directly by default;
      // the caller can still flip isSellable true for a branch that does sell
      // it directly (e.g. a takeaway jar) — see the schema comment in menu.ts.
      const isSellable = input.isSellable === undefined ? !isSemiFg : Boolean(input.isSellable);
      const id = randomUUID();
      await tx.insert(menuItems).values({ id, branchId, name, category, price, isSemiFg, isSellable });
      const [row] = await tx.select(columns).from(menuItems).where(eq(menuItems.id, id));
      return row;
    });
    return json({ menuItem: item }, 201);
  });
}
