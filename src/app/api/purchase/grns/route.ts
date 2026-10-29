import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { grns, grnLines, purchaseOrders } from "@/db/schema/purchase";
import { branches } from "@/db/schema/platform";
import { users } from "@/db/schema/auth";
import { rawMaterials } from "@/db/schema/menu";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { GRN_STATUSES, parseStatusFilter } from "@/lib/server/purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/purchase/grns?branchId=&status= — branch-scoped list for the
// GRN/Quality tab. Returns branchId/rawMaterialId/qtyReceived (single-line
// GRNs — the common case for a store PO raised from an Indent) so the
// EXISTING quality-check dialog can keep calling /api/inventory/receive
// unchanged, now against real rows instead of mock-data.ts. Multi-line GRNs
// (rare, only possible on a multi-material PO) surface their first line here
// for that same Quality Check flow — a true multi-line quality UI is out of
// this pass's scope, same boundary as the rest of this contract.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, query.get("branchId"));
    const status = parseStatusFilter(query.get("status"), GRN_STATUSES);

    const rows = await db
      .select({
        id: grns.id,
        poId: grns.poId,
        poNumber: purchaseOrders.poNumber,
        branchId: grns.branchId,
        branch: branches.name,
        status: grns.status,
        qualityResult: grns.qualityResult,
        qualityPhotoUrl: grns.qualityPhotoUrl,
        qualityNote: grns.qualityNote,
        receivedById: grns.receivedById,
        receivedBy: users.name,
        createdAt: grns.createdAt,
      })
      .from(grns)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, grns.poId))
      .innerJoin(branches, eq(branches.id, grns.branchId))
      .innerJoin(users, eq(users.id, grns.receivedById))
      .where(and(scope ? eq(grns.branchId, scope) : undefined, status ? eq(grns.status, status) : undefined))
      .orderBy(desc(grns.createdAt))
      .limit(200);

    if (!rows.length) return json({ grns: [] });
    const lines = await db
      .select({
        grnId: grnLines.grnId,
        rawMaterialId: grnLines.rawMaterialId,
        unit: rawMaterials.unit,
        itemDescription: grnLines.itemDescription,
        qtyOrdered: grnLines.qtyOrdered,
        qtyReceived: grnLines.qtyReceived,
        qtyFailed: grnLines.qtyFailed,
        rateOrdered: grnLines.rateOrdered,
      })
      .from(grnLines)
      .leftJoin(rawMaterials, eq(rawMaterials.id, grnLines.rawMaterialId));
    const firstLineByGrn = new Map<string, (typeof lines)[number]>();
    for (const line of lines) if (!firstLineByGrn.has(line.grnId)) firstLineByGrn.set(line.grnId, line);

    return json({
      grns: rows.map((r) => {
        const line = firstLineByGrn.get(r.id);
        return {
          ...r,
          rawMaterialId: line?.rawMaterialId ?? null,
          uom: line?.unit ?? "",
          qtyReceived: line ? Number(line.qtyReceived) : 0,
          qtyFailed: line ? Number(line.qtyFailed) : 0,
        };
      }),
    });
  });
}
