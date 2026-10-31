import { db } from "@/db/client";
import { vendors } from "@/db/schema/vendors";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vendor master is a global catalog (not branch-scoped), same convention as
// /api/raw-materials. Read-only lookup for the PO-creation vendor dropdown —
// vendor CRUD itself is out of this pass's scope (vendors.ts schema already
// has rows seeded elsewhere; this just lists them).
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const rows = await db.select({ id: vendors.id, name: vendors.name, phoneE164: vendors.phoneE164, tin: vendors.tin }).from(vendors).orderBy(vendors.name);
    return json({ vendors: rows });
  });
}
