import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { recordActualCutting } from "@/lib/server/cutting-production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-009 "Actual Cutting" mode — a separate production path from
// POST /api/semi-fg/production (Fixed-BOM). See
// src/db/schema/cutting-production.ts for the full design note.
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "MENU_BOM");
      const input = await body(request);
      if (input.branchId !== undefined && (typeof input.branchId !== "string" || !input.branchId)) throw new HttpError(400, "Invalid branchId");
      const branchId = branchScope(actor, input.branchId as string | undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      const { branchId: _branchId, ...rest } = input;
      return recordActualCutting(tx, actor.id, branchId, rest);
    });
    return json(result, result.replayed ? 200 : 201);
  });
}
