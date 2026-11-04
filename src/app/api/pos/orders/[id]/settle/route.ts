import { eq } from "drizzle-orm";
import { posOrderAttempts, posOrders, posReceipts } from "@/db/schema/pos";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { settlePosOrder } from "@/lib/server/pos-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "POS_CASHIER");
      const [order] = await tx.select({ branchId: posOrders.branchId }).from(posOrders).where(eq(posOrders.id, id)).limit(1);
      if (!order) throw new HttpError(404, "Order not found");
      branchScope(actor, order.branchId);
      return settlePosOrder(tx, actor, id, await body(request));
    });
    return json(result, (result as { replayed?: boolean }).replayed ? 200 : 201);
  });
}
