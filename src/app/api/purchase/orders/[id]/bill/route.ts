import { eq } from "drizzle-orm";
import { purchaseOrders } from "@/db/schema/purchase";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { allowedFields, assertPoNotBilled, billUrl } from "@/lib/server/purchase";
import { loadPo } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/orders/[id]/bill — Step 2 (optional). Text/URL field
// only: no real file-upload pipeline (S3 etc.) exists in this codebase yet,
// so `pdfUrl` is stored as-is, never a fabricated upload path.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_ORDER");
      const input = await body(request);
      allowedFields(input, ["pdfUrl"]);
      const { id } = await context.params;
      const po = await loadPo(tx, id);
      branchScope(actor, po.branchId);
      assertPoNotBilled(po.billUploadedAt);
      const pdfUrl = billUrl(input.pdfUrl);
      await tx.update(purchaseOrders).set({ pdfUrl, billUploadedAt: new Date() }).where(eq(purchaseOrders.id, id));
      const [row] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
      return { purchaseOrder: row };
    });
    return json(result);
  });
}
