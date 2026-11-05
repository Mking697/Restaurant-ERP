import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { centralGrns, centralGrnLines } from "@/db/schema/central-purchase";
import { rawMaterials } from "@/db/schema/menu";
import { users } from "@/db/schema/auth";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { assertModule, HttpError } from "@/lib/server/permissions";
import { fields } from "@/lib/server/batch-policy";
import { recordCentralGrnQuality } from "@/lib/server/central-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/central-purchase/grns?warehouseId= — list GRNs awaiting/having a
// quality decision.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const warehouseId = new URL(request.url).searchParams.get("warehouseId");
    const rows = await db
      .select({
        id: centralGrns.id, poId: centralGrns.poId, warehouseId: centralGrns.warehouseId,
        qualityResult: centralGrns.qualityResult, qualityNote: centralGrns.qualityNote,
        receivedById: centralGrns.receivedById, receivedBy: users.name, createdAt: centralGrns.createdAt,
      })
      .from(centralGrns).innerJoin(users, eq(users.id, centralGrns.receivedById))
      .where(warehouseId ? eq(centralGrns.warehouseId, warehouseId) : undefined)
      .orderBy(centralGrns.createdAt).limit(200);
    if (!rows.length) return json({ centralGrns: [] });
    const lines = await db.select({
      id: centralGrnLines.id, grnId: centralGrnLines.grnId, rawMaterialId: centralGrnLines.rawMaterialId, name: rawMaterials.name, unit: rawMaterials.unit,
      qtyOrdered: centralGrnLines.qtyOrdered, qtyReceived: centralGrnLines.qtyReceived, qtyFailed: centralGrnLines.qtyFailed, rateOrdered: centralGrnLines.rateOrdered,
    }).from(centralGrnLines).innerJoin(rawMaterials, eq(rawMaterials.id, centralGrnLines.rawMaterialId));
    const byGrn = new Map<string, typeof lines>();
    for (const line of lines) { const bucket = byGrn.get(line.grnId) ?? []; bucket.push(line); byGrn.set(line.grnId, bucket); }
    return json({ centralGrns: rows.map((r) => ({ ...r, lines: byGrn.get(r.id) ?? [] })) });
  });
}

// POST /api/central-purchase/grns/[id]/quality — once-only PASS/FAIL/PARTIAL
// decision. PASS/PARTIAL credits the accepted qty into Central warehouse
// stock + a real stock-batches lot; FAIL/PARTIAL lines just record
// qtyFailed (no automatic vendor-refund claim in v1 — see schema comment).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const result = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      fields(input, ["result", "note", "failedLines"]);
      const result = string(input.result, "result");
      if (!["PASS", "FAIL", "PARTIAL"].includes(result)) throw new HttpError(400, "Invalid result");
      const note = input.note === undefined || input.note === null ? "" : String(input.note).slice(0, 500);
      const failedLines = Array.isArray(input.failedLines)
        ? input.failedLines.map((l: unknown, i: number) => {
            if (!l || typeof l !== "object") throw new HttpError(400, `Invalid failed line ${i + 1}`);
            const line = l as Record<string, unknown>;
            return { lineId: string(line.lineId, `failed line ${i + 1} lineId`), qtyFailed: string(line.qtyFailed, `failed line ${i + 1} qtyFailed`) };
          })
        : [];
      return recordCentralGrnQuality(tx, actor, id, result as "PASS" | "FAIL" | "PARTIAL", note, failedLines);
    });
    return json(result);
  });
}
