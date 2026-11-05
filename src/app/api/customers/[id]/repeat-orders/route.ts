import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { recentOrdersForMember } from "@/lib/server/repeat-orders";
import { db } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const { id } = await params;
    const branchId = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    if (!branchId) throw new HttpError(400, "Select a branch");
    const orders = await recentOrdersForMember(db, actor, branchId, id);
    return json({ orders });
  });
}
