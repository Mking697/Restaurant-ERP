import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { parseSubmitCountInput, submitStockCount } from "@/lib/server/stock-count";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const { id } = await params;
      const lines = parseSubmitCountInput(await body(request));
      // branchScope is re-asserted inside submitStockCount via the count's
      // own branchId (loadCountForUpdate) — no need to duplicate it here.
      return submitStockCount(tx, actor, id, lines);
    });
    return json({ stockCount: result });
  });
}
