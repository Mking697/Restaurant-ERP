import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { readReorderSuggestion } from "@/lib/server/replenishment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const suggestion = await locked(async tx => readReorderSuggestion(tx, await requireIdentity(request, tx), id));
    return json({ suggestion });
  });
}
