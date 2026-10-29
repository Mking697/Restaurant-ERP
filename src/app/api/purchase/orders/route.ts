import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { indents, indentLines, purchaseOrders, purchaseOrderLines } from "@/db/schema/purchase";
import { branches } from "@/db/schema/platform";
import { vendors } from "@/db/schema/vendors";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { allowedFields, assertIndentApprovedForPo, assertPoMatchesIndent, generatePoNumber, parseGeneralPurchase, parsePoIndentId, parsePoLines, PO_STATUSES, parseStatusFilter } from "@/lib/server/purchase";
import { ensureBranch, ensureRawMaterial, ensureVendor, loadIndent } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/purchase/orders?branchId=&status= — branch-scoped list for the
// Purchase Orders tab.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, query.get("branchId"));
    const status = parseStatusFilter(query.get("status"), PO_STATUSES);

    const rows = await db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        branchId: purchaseOrders.branchId,
        branch: branches.name,
        vendorId: purchaseOrders.vendorId,
        vendor: vendors.name,
        indentId: purchaseOrders.indentId,
        isGeneralPurchase: purchaseOrders.isGeneralPurchase,
        status: purchaseOrders.status,
        boughtAt: purchaseOrders.boughtAt,
        pdfUrl: purchaseOrders.pdfUrl,
        billUploadedAt: purchaseOrders.billUploadedAt,
        materialReceivedAt: purchaseOrders.materialReceivedAt,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .innerJoin(branches, eq(branches.id, purchaseOrders.branchId))
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(and(scope ? eq(purchaseOrders.branchId, scope) : undefined, status ? eq(purchaseOrders.status, status) : undefined))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(200);

    if (!rows.length) return json({ purchaseOrders: [] });
    const allLines = await db
      .select({ poId: purchaseOrderLines.poId, rawMaterialId: purchaseOrderLines.rawMaterialId, itemDescription: purchaseOrderLines.itemDescription, qty: purchaseOrderLines.qty, rate: purchaseOrderLines.rate })
      .from(purchaseOrderLines);
    const byPo = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const bucket = byPo.get(line.poId) ?? [];
      bucket.push(line);
      byPo.set(line.poId, bucket);
    }
    return json({ purchaseOrders: rows.map((r) => ({ ...r, lines: byPo.get(r.id) ?? [] })) });
  });
}

// POST /api/purchase/orders — create a PO, Step 1 (Buy). Either from an
// APPROVED indent (store/raw-material purchase, moves the indent to
// PO_RAISED) or a general purchase with free-text item-description lines.
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_ORDER");
      const input = await body(request);
      allowedFields(input, ["branchId", "vendorId", "isGeneralPurchase", "indentId", "lines"]);
      const branchId = branchScope(actor, string(input.branchId, "branchId"));
      if (!branchId) throw new HttpError(400, "Select a branch");
      await ensureBranch(tx, branchId);
      const vendorId = string(input.vendorId, "vendorId");
      await ensureVendor(tx, vendorId);
      const isGeneralPurchase = parseGeneralPurchase(input.isGeneralPurchase);
      const indentIdInput = parsePoIndentId(input.indentId, isGeneralPurchase);

      let indent: Awaited<ReturnType<typeof loadIndent>> | null = null;
      if (indentIdInput) {
        indent = await loadIndent(tx, indentIdInput);
        branchScope(actor, indent.branchId);
        if (indent.branchId !== branchId) throw new HttpError(400, "Indent branch does not match the Purchase Order branch");
        assertIndentApprovedForPo(indent.status); // denies REJECTED/DRAFT/PENDING_APPROVAL/PO_RAISED indents
      }

      const lines = parsePoLines(input.lines, isGeneralPurchase);
      if (!isGeneralPurchase) {
        const approvedLines = await tx.select({ rawMaterialId: indentLines.rawMaterialId, qty: indentLines.qty })
          .from(indentLines).where(eq(indentLines.indentId, indentIdInput!));
        assertPoMatchesIndent(lines, approvedLines);
        for (const line of lines) await ensureRawMaterial(tx, line.rawMaterialId!);
      }

      const id = randomUUID();
      const poNumber = generatePoNumber();
      await tx.insert(purchaseOrders).values({ id, poNumber, branchId, vendorId, indentId: indentIdInput, isGeneralPurchase, status: "CREATED", boughtAt: new Date() });
      await tx.insert(purchaseOrderLines).values(
        lines.map((l) => ({ id: randomUUID(), poId: id, rawMaterialId: l.rawMaterialId, itemDescription: l.itemDescription, qty: l.qty, rate: l.rate }))
      );
      if (indentIdInput) await tx.update(indents).set({ status: "PO_RAISED" }).where(eq(indents.id, indentIdInput));

      const [row] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
      return { purchaseOrder: row, lines };
    });
    return json(result, 201);
  });
}
