import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { posOrders } from "@/db/schema/pos";
import { branches } from "@/db/schema/platform";
import { requireIdentity } from "@/lib/server/auth";
import { api, assertSameOrigin, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { offerMessage } from "@/lib/server/whatsapp-triggers";
import { sendWhatsAppBatch } from "@/lib/chatxflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Offer Alert — broadcasts a WhatsApp message to every DISTINCT customer
// phone number captured on a real past pos_orders row (via the Thank You
// flow), scoped by branch. No separate customer-master table exists yet,
// so the target list is derived data, not a fabricated contact list — a
// customer only appears here because they actually ordered and a cashier
// captured their number.
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const input = await body(request);
    const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
    const offerText = typeof input.offerText === "string" ? input.offerText.trim() : "";
    if (!offerText || offerText.length < 3 || offerText.length > 400) throw new HttpError(400, "Enter offer text (3-400 characters)");
    const validUntil = typeof input.validUntil === "string" ? input.validUntil.slice(0, 40) : "";

    const [branchRow] = branchId ? await db.select({ name: branches.name }).from(branches).where(eq(branches.id, branchId)).limit(1) : [];
    const branchName = branchId ? branchRow?.name ?? "" : "All Branches";

    const customerRows = await db
      .selectDistinct({ phone: posOrders.customerPhone })
      .from(posOrders)
      .where(and(branchId ? eq(posOrders.branchId, branchId) : undefined, isNotNull(posOrders.customerPhone), ne(posOrders.customerPhone, "")));
    const phones = customerRows.map((r) => r.phone).filter((p): p is string => !!p);
    if (!phones.length) throw new HttpError(400, "No past customers with a WhatsApp number in this scope yet");

    const message = offerMessage({ offerText, validUntil, branchName });
    const outcome = await sendWhatsAppBatch(phones.map((phone) => ({ phone, message, relatedEntityType: "OfferAlert", relatedEntityId: branchId || "ALL" })));
    return json({ message, targeted: phones.length, ...outcome }, 201);
  });
}

// Preview the target audience size before sending (no side effect).
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const branchId = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const customerRows = await db
      .selectDistinct({ phone: posOrders.customerPhone })
      .from(posOrders)
      .where(and(branchId ? eq(posOrders.branchId, branchId) : undefined, isNotNull(posOrders.customerPhone), ne(posOrders.customerPhone, "")));
    return json({ targetCount: customerRows.length });
  });
}
