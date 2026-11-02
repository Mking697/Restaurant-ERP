import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { actOnHoReviewSubject } from "@/lib/server/ho-stock-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const input = await body(request);
    const result = await mutate(request, (tx, actor) => actOnHoReviewSubject(tx, actor, id, input));
    return json(result);
  });
}
