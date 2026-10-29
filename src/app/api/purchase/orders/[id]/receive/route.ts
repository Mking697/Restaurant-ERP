import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { purchaseOrders, purchaseOrderLines, grns, grnLines } from "@/db/schema/purchase";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { allowedFields, assertPoNotReceived } from "@/lib/server/purchase";
import { loadPo } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/orders/[id]/receive — Step 3 (Material Receive).
// Creates the GRN row (PENDING quality) shaped exactly for the ALREADY-REAL
// quality-check -> /api/inventory/receive flow (src/app/api/inventory/receive
// + the GRN dialog in purchase/page-content.tsx) — this route does NOT
// duplicate that posting logic, it only produces the GRN+lines it reads.
// No per-line received-quantity override exists in the current UI (it never
// collected one even on mock data), so qtyReceived defaults to qtyOrdered;
// a real "receive less than ordered" flow is a later increment, not faked here.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_ORDER");
      allowedFields(await body(request), []);
      const { id } = await context.params;
      const po = await loadPo(tx, id);
      branchScope(actor, po.branchId);
      assertPoNotReceived(po.materialReceivedAt);

      const poLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
      if (!poLines.length) throw new Error("Purchase order has no lines"); // should be unreachable, PO always has >=1 line

      const grnId = randomUUID();
      await tx.insert(grns).values({ id: grnId, poId: id, branchId: po.branchId, receivedById: actor.id, status: "PENDING", qualityResult: "PENDING" });
      await tx.insert(grnLines).values(
        poLines.map((l) => ({
          id: randomUUID(),
          grnId,
          rawMaterialId: l.rawMaterialId,
          itemDescription: l.itemDescription,
          qtyOrdered: l.qty,
          qtyReceived: l.qty,
          rateOrdered: l.rate,
        }))
      );
      await tx.update(purchaseOrders).set({ materialReceivedAt: new Date(), status: "RECEIVED" }).where(eq(purchaseOrders.id, id));

      const [grn] = await tx.select().from(grns).where(eq(grns.id, grnId));
      const lines = await tx.select().from(grnLines).where(eq(grnLines.grnId, grnId));
      return { grn, lines };
    });
    return json(result, 201);
  });
}
