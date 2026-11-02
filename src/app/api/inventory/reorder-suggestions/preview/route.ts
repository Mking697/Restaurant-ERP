import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { HttpError } from "@/lib/server/permissions";
import { previewReorderSuggestions } from "@/lib/server/replenishment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request);
    allowedFields(input, ["branchId"]);
    const branchId = typeof input.branchId === "string" ? input.branchId : "";
    if (!branchId) throw new HttpError(400, "branchId is required");
    const suggestions = await mutate(request, (tx, actor) => previewReorderSuggestions(tx, actor, branchId));
    return json({ suggestions });
  });
}
