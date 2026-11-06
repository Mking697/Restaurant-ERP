import { eq } from "drizzle-orm";
import { warehouses } from "@/db/schema/warehouses";
import { mutate } from "@/lib/server/auth";
import { checkWarehouseDeletion } from "@/lib/server/warehouse-deletion";
import { api, json } from "@/lib/server/http";
import { assertOwner, HttpError } from "@/lib/server/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
// Structural/HQ-level, Owner only — same convention as POST (route.ts).
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const { id } = await context.params;
    await mutate(request, async (tx, actor) => {
      assertOwner(actor);
      const check = await checkWarehouseDeletion(tx, actor, id);
      if (!check.canDelete) throw new HttpError(409, "Linked records prevent deletion of this warehouse. No records were removed or reassigned. Check deletion readiness for dependency counts.");
      // Readiness is never a client authorization token. Recheck in this
      // mutation; the unchanged foreign keys remain final protection against
      // a concurrent stock transfer/PO/GRN linking to this warehouse.
      const rows = await tx.delete(warehouses).where(eq(warehouses.id, id)).returning({ id: warehouses.id });
      if (!rows.length) throw new HttpError(404, "Warehouse not found");
    });
    return json({ ok: true });
  });
}
