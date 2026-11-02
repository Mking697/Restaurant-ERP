import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { HttpError } from "@/lib/server/permissions";
import { convertReorderSuggestion } from "@/lib/server/replenishment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const input = await body(request);
    allowedFields(input, ["requestKey"]);
    const requestKey = typeof input.requestKey === "string" ? input.requestKey : "";
    if (!requestKey) throw new HttpError(400, "requestKey is required");
    const result = await mutate(request, (tx, actor) => convertReorderSuggestion(tx, actor, id, requestKey));
    return json(result);
  });
}
