import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { branchScope, HttpError, type Identity } from "@/lib/server/permissions";
import { reverseEarnForOrder } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Standalone — NOT YET wired into the actual POS void/reversal flow (see
// docs/gap039-verification.md's explicit limits). Branch Manager/Owner
// only, same authority bar as other reversal-class actions in this codebase.
function assertReversalAuthority(actor: Identity) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "BRANCH_MANAGER") throw new HttpError(403, "Manager or Owner access required to reverse a reward earn");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params; // unused — reversal targets sourceOrderId, not a specific customer id, but kept for route symmetry with earn/redeem
    void id;
    const event = await mutate(request, async (tx, actor) => {
      assertReversalAuthority(actor);
      const input = await body(request);
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      const sourceOrderId = typeof input.sourceOrderId === "string" ? input.sourceOrderId : "";
      if (!sourceOrderId) throw new HttpError(400, "sourceOrderId required");
      return reverseEarnForOrder(tx, actor, branchId, sourceOrderId);
    });
    return json({ event });
  });
}
