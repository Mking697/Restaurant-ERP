import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { issueProformaPosDocument } from "@/lib/server/pos-documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => issueProformaPosDocument(tx, actor, await body(request)));
    return json(result, result.replayed ? 200 : 201);
  });
}
