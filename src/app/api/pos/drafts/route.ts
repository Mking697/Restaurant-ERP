import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/permissions";
import { createPosDraft } from "@/lib/server/pos-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      if (typeof input.branchId !== "string" || !input.branchId.trim() || input.branchId.length > 200) throw new HttpError(400, "branchId is required");
      return createPosDraft(tx, actor, input.branchId, input);
    });
    return json(result, "replayed" in result && result.replayed ? 200 : 201);
  });
}
