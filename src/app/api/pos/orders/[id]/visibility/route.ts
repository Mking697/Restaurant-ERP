import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { posOrders } from "@/db/schema/pos";
import { auditLog } from "@/db/schema/whatsapp";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, HttpError } from "@/lib/server/permissions";
import { parseVisibilityChange } from "@/lib/server/order-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => {
      // Owner role, not a delegable module; identity is resolved after the
      // shared mutation lock. Audit failure rolls back visibility too.
      assertOwner(actor);
      const input = parseVisibilityChange(await body(request));
      const [order] = await tx.select({ id: posOrders.id, branchId: posOrders.branchId, ownerOnly: posOrders.ownerOnly }).from(posOrders).where(eq(posOrders.id, id)).limit(1);
      if (!order) throw new HttpError(404, "Order not found");
      if (order.ownerOnly === input.ownerOnly) return { order: { id: order.id, ownerOnly: order.ownerOnly }, changed: false };
      await tx.update(posOrders).set({ ownerOnly: input.ownerOnly }).where(eq(posOrders.id, id));
      await tx.insert(auditLog).values({
        id: randomUUID(), userId: actor.id, action: "POS_ORDER_VISIBILITY_CHANGED", entityType: "PosOrder", entityId: order.id,
        metadataJson: { branchId: order.branchId, previousOwnerOnly: order.ownerOnly, ownerOnly: input.ownerOnly, reason: input.reason },
      });
      return { order: { id: order.id, ownerOnly: input.ownerOnly }, changed: true };
    });
    return json(result);
  });
}
