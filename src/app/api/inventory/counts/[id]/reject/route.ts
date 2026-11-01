import { mutate } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { assertModule, HttpError } from "@/lib/server/permissions";
import { rejectStockCount } from "@/lib/server/stock-count";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const { id } = await params;
      const input = await body(request);
      if (Object.keys(input).some((key) => key !== "reviewNote")) throw new HttpError(400, "Unexpected field");
      const reviewNote = string(input.reviewNote, "reviewNote", 1000);
      return rejectStockCount(tx, actor, id, reviewNote);
    });
    return json({ stockCount: result });
  });
}
