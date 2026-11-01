import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { receiveSemiFgTransfer } from "@/lib/server/semi-fg-transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      return receiveSemiFgTransfer(tx, actor, id, input);
    });
    return json(result, 200);
  });
}
