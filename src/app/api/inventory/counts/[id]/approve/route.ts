import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { approveStockCount } from "@/lib/server/stock-count";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const { id } = await params;
      return approveStockCount(tx, actor, id);
    });
    return json({ stockCount: result });
  });
}
