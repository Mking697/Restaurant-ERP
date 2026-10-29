import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { updateRecurringStatus } from "@/lib/server/tasks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return api(async () => {
  const { id } = await context.params;
  const result = await mutate(request, async (tx, actor) => updateRecurringStatus(tx, actor, id, await body(request)));
  return json(result);
}); }
