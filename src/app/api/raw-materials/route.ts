import { db } from "@/db/client";
import { rawMaterials } from "@/db/schema/menu";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { hasModule, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Raw materials are a global catalog (not branch-scoped), same convention as
// the inventory POST route's catalog-reuse comment. Gated to either module
// that reads this catalog today.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    if (!hasModule(actor, "MENU_BOM") && !hasModule(actor, "INVENTORY")) throw new HttpError(403, "Module access required");
    const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name, unit: rawMaterials.unit, category: rawMaterials.category }).from(rawMaterials).orderBy(rawMaterials.name);
    return json({ rawMaterials: materials });
  });
}
