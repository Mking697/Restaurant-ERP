import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { editPosDraft } from "@/lib/server/pos-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => editPosDraft(tx, actor, id, await body(request)));
    return json(result);
  });
}
