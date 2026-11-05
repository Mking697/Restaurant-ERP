import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, branchScope, HttpError } from "@/lib/server/permissions";
import { expireOldEarns } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only maintenance action — posts EXPIRE events for this member's
// aged-out (12-month) unredeemed points. Safe to call repeatedly.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const events = await mutate(request, async (tx, actor) => {
      assertOwner(actor);
      const input = await body(request);
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      return expireOldEarns(tx, actor, branchId, id);
    });
    return json({ events });
  });
}
