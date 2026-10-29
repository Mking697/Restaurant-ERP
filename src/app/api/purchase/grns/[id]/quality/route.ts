import { mutate } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { recordGrnQuality } from "@/lib/server/grn-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => recordGrnQuality(tx, actor, string((await context.params).id, "GRN ID"), await body(request)));
    return json(result);
  });
}
