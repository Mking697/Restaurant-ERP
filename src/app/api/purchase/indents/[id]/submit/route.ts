import { eq } from "drizzle-orm";
import { indents, indentLines } from "@/db/schema/purchase";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { aggregateIndentLinesByMaterial, allowedFields, assertIndentDraft, computeRollingAverages, evaluateIndentSpike } from "@/lib/server/purchase";
import { loadIndent } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/indents/[id]/submit — DRAFT -> PENDING_APPROVAL or
// DRAFT -> APPROVED (free path), decided by a REAL rolling-average spike
// check against actually-posted GRN receipts (AUTOMATION-1c).
//
// Per (branchId, rawMaterialId), computeRollingAverages looks at the
// trailing ROLLING_AVERAGE_WINDOW_DAYS of already-posted GRNs (status
// APPROVED — set only on a real PASS/PARTIAL quality decision, see
// grn-quality.ts). With fewer than ROLLING_AVERAGE_MIN_SAMPLES real receipts
// for a line's material, there is no real average to compare against —
// dailyAvgQtyJson/spikePercent stay null (never fabricated). If ANY
// requested material lacks adequate history, the whole indent takes the
// fail-safe PENDING_APPROVAL path. Only complete baseline coverage allows:
// no line over the fixed >25% threshold (src/db/schema/purchase.ts) takes
// the free APPROVED path (no owner approval needed); any line over 25%
// stores the real per-material snapshot and the highest line's
// spikePercent, and status goes to PENDING_APPROVAL — matching the
// schema's own ">25% spike vs daily average -> owner WhatsApp approval"
// comment. The actual WhatsApp send (AUTOMATION-1b) is a separate,
// still-blocked item and is not touched here.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_INDENT");
      allowedFields(await body(request), []);
      const { id } = await context.params;
      const indent = await loadIndent(tx, id);
      branchScope(actor, indent.branchId);
      assertIndentDraft(indent.status);

      const rawLines = await tx
        .select({ rawMaterialId: indentLines.rawMaterialId, qty: indentLines.qty })
        .from(indentLines)
        .where(eq(indentLines.indentId, id));
      const lines = aggregateIndentLinesByMaterial(rawLines);
      const averages = await computeRollingAverages(tx, indent.branchId, lines.map((l) => l.rawMaterialId));
      const spike = evaluateIndentSpike(lines, averages);

      const status = spike.isSpike || !spike.hasData ? "PENDING_APPROVAL" : "APPROVED";
      await tx
        .update(indents)
        .set({
          status,
          dailyAvgQtyJson: spike.isSpike ? spike.dailyAvgQtyJson : null,
          spikePercent: spike.isSpike ? spike.spikePercent : null,
        })
        .where(eq(indents.id, id));
      const [row] = await tx.select().from(indents).where(eq(indents.id, id));

      const note = !spike.hasData
        ? "Adequate real rolling daily-average data is missing for one or more requested materials (fewer than the minimum historical GRN receipts); retained for approval with spikePercent left null rather than fabricated."
        : spike.isSpike
          ? "Real rolling-average spike detected (>25% over the trailing-window average of actually-posted GRN receipts); routed to owner approval."
          : "Real rolling-average data exists and no line exceeded the 25% spike threshold; auto-approved without owner review.";
      return { indent: row, spikeComputed: spike.hasData, note };
    });
    return json(result);
  });
}
