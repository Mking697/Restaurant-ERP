import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, HttpError } from "@/lib/server/permissions";
import { setPreparedStockThresholds } from "@/lib/server/prepared-stock-thresholds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-012. Prepared-stock (Semi-FG) min/max par levels — MENU_BOM-
// authorized (same module gate as raw-material par levels in
// /api/inventory, not Owner-exclusive). Never touches qtyOnHand itself —
// that stays production/consumption-derived only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const row = await mutate(request, async (tx, actor) => {
      assertModule(actor, "MENU_BOM");
      const input = await body(request);
      if (typeof input.branchId !== "string" || !input.branchId) throw new HttpError(400, "Invalid branchId");
      return setPreparedStockThresholds(tx, actor, input.branchId, id, input);
    });
    return json({ semiFgStock: row }, 200);
  });
}
