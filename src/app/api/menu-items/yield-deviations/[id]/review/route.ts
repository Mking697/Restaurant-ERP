import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { reviewYieldDeviation } from "@/lib/server/yield-standards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const deviation = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      return reviewYieldDeviation(tx, actor, id, input);
    });
    return json({ deviation });
  });
}
