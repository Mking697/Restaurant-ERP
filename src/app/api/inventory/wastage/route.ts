import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { allowedFields } from "@/lib/server/purchase";
import { logWastage, parseWastageInput } from "@/lib/server/inventory-adjustments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/inventory/wastage — GAP-004 remaining-scope follow-up. Debits
// REAL inventory_stock (fails closed if the requested qty exceeds what's
// actually on hand), writes a mandatory-proof wastageLogs audit row, and
// posts a WASTAGE_WRITE_OFF entry to the stock ledger
// (src/lib/server/stock-ledger.ts). Reads are served by the combined
// GET /api/inventory/variance (same report, both wastage and physical
// counts together).
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const input = await body(request);
      allowedFields(input, ["branchId", "rawMaterialId", "qty", "reason", "photoUrl"]);
      if (typeof input.branchId !== "string" || !input.branchId) throw new HttpError(400, "branchId is required");
      const branchId = branchScope(actor, input.branchId) ?? input.branchId;
      const parsed = parseWastageInput({ rawMaterialId: input.rawMaterialId, qty: input.qty, reason: input.reason, photoUrl: input.photoUrl });
      return logWastage(tx, actor, branchId, parsed);
    });
    return json({ wastage: result }, 201);
  });
}
