import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { acceptHoCashDispatch } from "@/lib/server/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-036: Owner/SUPER_ADMIN only — enforced inside acceptHoCashDispatch
// itself (not just at this route), including the self-acceptance block.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const dispatch = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      return acceptHoCashDispatch(tx, actor, id, input.acceptedAmountInr);
    });
    return json({ dispatch }, 200);
  });
}
