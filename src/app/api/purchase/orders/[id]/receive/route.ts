import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { purchaseOrders, purchaseOrderLines, grns, grnLines } from "@/db/schema/purchase";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { allowedFields, assertPoReceivable, computeOutstandingReceive, parseReceiveLines } from "@/lib/server/purchase";
import { loadPo } from "../../../_shared";
import { auditLog } from "@/db/schema/whatsapp";
import { qualityOriginId } from "@/lib/server/grn-quality-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/orders/[id]/receive — Step 3 (Material Receive).
// Creates a PENDING GRN, all lines and trusted origin for the GRN-bound
// POST /api/purchase/grns/[id]/quality flow. That endpoint owns atomic,
// once-only quality and accepted-stock posting; this route never posts stock.
// GAP-005 multi-delivery: a PO can now be received across SEVERAL separate
// GRNs (a real vendor shortage this round, the rest arriving later) instead
// of exactly one. Each call computes what's still OUTSTANDING per line
// (ordered minus every prior GRN's qtyReceived for that line — see
// computeOutstandingReceive) and caps this receive against THAT, not the
// original ordered qty. An optional `lines` body field records the real
// COUNTED quantity per line (can be less than what's outstanding); omitted
// lines default to receiving the FULL remaining outstanding amount.
// PO status becomes PARTIALLY_RECEIVED while anything remains outstanding
// after this receive, RECEIVED once every line is fully received. A further
// receive attempt on an already-fully-received PO is rejected (409).
// "One invoice per PO" is UNCHANGED — see vendor-invoices.ts, which now
// requires PO status RECEIVED (every delivery done) before invoicing.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_ORDER");
      const input = await body(request);
      allowedFields(input, ["lines"]);
      const { id } = await context.params;
      const po = await loadPo(tx, id);
      branchScope(actor, po.branchId);

      const poLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
      if (!poLines.length) throw new Error("Purchase order has no lines"); // should be unreachable, PO always has >=1 line
      const priorGrns = await tx.select({ id: grns.id }).from(grns).where(eq(grns.poId, id));
      const priorGrnLines = priorGrns.length
        ? await tx.select({ rawMaterialId: grnLines.rawMaterialId, itemDescription: grnLines.itemDescription, qtyReceived: grnLines.qtyReceived }).from(grnLines).where(inArray(grnLines.grnId, priorGrns.map((g) => g.id)))
        : [];
      const outstanding = computeOutstandingReceive(poLines, priorGrnLines);
      assertPoReceivable(outstanding);
      const overrides = parseReceiveLines(input.lines, outstanding);
      const keyOf = (l: { rawMaterialId: string | null; itemDescription: string }) => l.rawMaterialId ?? `desc:${l.itemDescription}`;

      const grnId = randomUUID();
      await tx.insert(grns).values({ id: grnId, poId: id, branchId: po.branchId, receivedById: actor.id, status: "PENDING", qualityResult: "PENDING" });
      await tx.insert(grnLines).values(
        outstanding.map((l) => {
          const poLine = poLines.find((p) => keyOf(p) === keyOf(l))!;
          return {
            id: randomUUID(),
            grnId,
            rawMaterialId: l.rawMaterialId,
            itemDescription: l.itemDescription,
            qtyOrdered: poLine.qty,
            qtyReceived: overrides.get(keyOf(l)) ?? l.qty,
            rateOrdered: poLine.rate,
          };
        })
      );
      const thisReceipt = new Map(outstanding.map((l) => [keyOf(l), overrides.get(keyOf(l)) ?? l.qty]));
      const remainingAfter = computeOutstandingReceive(
        poLines,
        [...priorGrnLines, ...outstanding.map((l) => ({ rawMaterialId: l.rawMaterialId, itemDescription: l.itemDescription, qtyReceived: thisReceipt.get(keyOf(l))! }))]
      );
      const fullyReceived = remainingAfter.length === 0;
      await tx.update(purchaseOrders).set({ materialReceivedAt: po.materialReceivedAt ?? new Date(), status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" }).where(eq(purchaseOrders.id, id));

      const [grn] = await tx.select().from(grns).where(eq(grns.id, grnId));
      const lines = await tx.select().from(grnLines).where(eq(grnLines.grnId, grnId));
      // Short THIS ROUND = didn't fully clear what was outstanding coming in.
      const outstandingByKey = new Map(outstanding.map((l) => [keyOf(l), l.qty]));
      const shortfalls = lines
        .filter((l) => Number(l.qtyReceived) < Number(outstandingByKey.get(keyOf(l)) ?? "0"))
        .map((l) => ({ rawMaterialId: l.rawMaterialId, itemDescription: l.itemDescription, qtyOutstanding: outstandingByKey.get(keyOf(l)), qtyReceived: l.qtyReceived }));
      await tx.insert(auditLog).values({ id: qualityOriginId(grnId), userId: actor.id, action: "GRN_CREATED", entityType: "GRN", entityId: grnId, metadataJson: { version: 1, branchId: po.branchId, poId: po.id, shortfalls, poStatus: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
      return { grn, lines, shortfalls, poStatus: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" };
    });
    return json(result, 201);
  });
}


