import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { posOrders } from "@/db/schema/pos";
import { locked, mutate, requireIdentity } from "@/lib/server/auth";
import { operationalOrderVisibility, salesSummaryFor } from "@/lib/server/order-visibility";
import { api, body, json } from "@/lib/server/http";
import { assertAnyModule, branchScope, HttpError } from "@/lib/server/permissions";
import { createPosOrder } from "@/lib/server/pos-orders";
import { businessDayRange } from "@/lib/server/business-calendar";
import { posSaleTime } from "@/lib/server/pos-reporting";
import { thankYouMessage } from "@/lib/server/whatsapp-triggers";
import { buildOptOutUrl, isOptedOut } from "@/lib/server/whatsapp-preferences";
import { getSetting } from "@/lib/settings";
import { sendWhatsAppMessage } from "@/lib/chatxflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(() => locked(async tx => {
    const actor = await requireIdentity(request, tx);
    assertAnyModule(actor, ["POS_CASHIER", "POS_WAITER"]);
    const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const { start, end } = businessDayRange();
    const branch = scope ? eq(posOrders.branchId, scope) : undefined;
    const paidToday = and(inArray(posOrders.status, ["PAID", "COMPLETED"]), gte(posSaleTime, start), lt(posSaleTime, end));
    // Keep every still-open table eligible across midnight. Today's voids remain
    // visible for operational review, but never contribute to the paid total.
    const window = and(branch, or(eq(posOrders.status, "OPEN"), paidToday, and(eq(posOrders.status, "VOIDED"), gte(posOrders.createdAt, start), lt(posOrders.createdAt, end))));
    const permitted = operationalOrderVisibility(actor);
    const orderListLimit = 200;
    const rows = await tx
      .select({ id: posOrders.id, branchId: posOrders.branchId, orderNumber: posOrders.orderNumber, channel: posOrders.channel, operatingConcept: posOrders.operatingConcept, tableNo: posOrders.tableNo, counterNo: posOrders.counterNo, totalAmount: posOrders.totalAmount, tenderType: posOrders.tenderType, tenderCurrencyCode: posOrders.tenderCurrencyCode, tenderCurrencyAmount: posOrders.tenderCurrencyAmount, status: posOrders.status, createdAt: posOrders.createdAt, settledAt: posOrders.settledAt, ...(actor.role === "SUPER_ADMIN" ? { ownerOnly: posOrders.ownerOnly } : {}) })
      .from(posOrders).where(and(window, permitted)).orderBy(sql`case when ${posOrders.status} = 'OPEN' then 0 else 1 end`, desc(posSaleTime), desc(posOrders.id)).limit(orderListLimit + 1);
    const orders = rows.slice(0, orderListLimit);
    const [totals] = await tx.select({
      actualTotal: sql<string>`coalesce(sum(${posOrders.totalAmount}), 0)::numeric(20,2)::text`,
      visibleTotal: sql<string>`coalesce(sum(case when ${posOrders.ownerOnly} = false then ${posOrders.totalAmount} else 0 end), 0)::numeric(20,2)::text`,
    }).from(posOrders).where(and(branch, permitted, paidToday));
    return json({ orders, orderList: { limit: orderListLimit, truncated: rows.length > orderListLimit }, visibilityScope: actor.role === "SUPER_ADMIN" ? "actual" : "access-filtered", salesSummary: salesSummaryFor(actor, totals) });
  }));
}

export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertAnyModule(actor, ["POS_CASHIER", "POS_WAITER"]);
      const input = await body(request);
      if (["ownerOnly", "owner_only", "visibility"].some(key => key in input)) throw new HttpError(400, "Order visibility can only be changed by the Owner using the visibility action");
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      return createPosOrder(tx, actor, branchId, input);
    }) as Record<string, unknown>;
    const order = result.order as { id: string; orderNumber: string; branchName: string; customerPhone: string; customerName: string; status: string };
    const receipt = result.receipt as { totalAmount: string } | null;
    let whatsapp: { attempted: boolean; sent: boolean; error?: string } = { attempted: false, sent: false };
    if (!result.replayed && order.status === "PAID" && order.customerPhone && receipt) {
      // GAP-037: an explicit opt-out is the customer's own request to stop
      // ALL contact — the order/receipt itself is unaffected (it already
      // succeeded above), only this best-effort WhatsApp send is skipped.
      if (await isOptedOut(db, order.customerPhone)) {
        whatsapp = { attempted: false, sent: false };
      } else {
        const [communityUrl, appPublicUrl] = await Promise.all([getSetting("WHATSAPP_COMMUNITY_URL"), getSetting("APP_PUBLIC_URL")]);
        const optOutUrl = buildOptOutUrl(appPublicUrl, order.customerPhone);
        const message = thankYouMessage({ customerName: order.customerName, orderNumber: order.orderNumber, totalAmount: receipt.totalAmount, branchName: order.branchName, communityUrl, optOutUrl });
        const sendResult = await sendWhatsAppMessage(order.customerPhone, message, { relatedEntityType: "PosOrder", relatedEntityId: order.id });
        whatsapp = { attempted: true, sent: sendResult.ok, error: sendResult.ok ? undefined : sendResult.error };
      }
    }
    return json({ ...result, whatsapp }, result.replayed ? 200 : 201);
  });
}
