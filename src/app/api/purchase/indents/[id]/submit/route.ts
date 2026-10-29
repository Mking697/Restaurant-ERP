import { eq } from "drizzle-orm";
import { indents } from "@/db/schema/purchase";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { allowedFields, assertIndentDraft } from "@/lib/server/purchase";
import { loadIndent } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/indents/[id]/submit — DRAFT -> PENDING_APPROVAL. No
// spike/daily-average figure is fabricated: there is no real rolling-average
// data source yet, so dailyAvgQtyJson/spikePercent are explicitly left null
// (matches this project's "don't fabricate a number with no real data" rule).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_INDENT");
      allowedFields(await body(request), []);
      const { id } = await context.params;
      const indent = await loadIndent(tx, id);
      branchScope(actor, indent.branchId);
      assertIndentDraft(indent.status);
      await tx.update(indents).set({ status: "PENDING_APPROVAL" }).where(eq(indents.id, id));
      const [row] = await tx.select().from(indents).where(eq(indents.id, id));
      return { indent: row, spikeComputed: false, note: "No real rolling daily-average data exists yet; spikePercent left null rather than fabricated." };
    });
    return json(result);
  });
}
