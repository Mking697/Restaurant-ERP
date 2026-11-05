import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { lookupMemberByQrToken } from "@/lib/server/customer-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-040: staff-facing POS lookup — resolves a scanned/typed code to a
// member's identity ONLY (see the long comment on lookupMemberByQrToken).
// Any POS_CASHIER-module staff may use this; it never itself authorizes a
// redemption or any other high-value action.
export async function POST(request: Request) {
  return api(() => mutate(request, async (tx, actor) => {
    assertModule(actor, "POS_CASHIER");
    const input = await body(request);
    const customer = await lookupMemberByQrToken(tx, typeof input.token === "string" ? input.token : "");
    return json({ customer });
  }));
}
