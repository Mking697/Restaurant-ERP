import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { centralPurchaseOrders } from "@/db/schema/central-purchase";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, HttpError } from "@/lib/server/permissions";
import { assertCentralPoNotBilled } from "@/lib/server/central-purchase";
import {
  billDocumentPathname, deletePurchaseDocument, MAX_DOCUMENT_BYTES,
  signedPurchaseDocumentUrl, uploadPurchaseDocument, validatePurchaseDocument,
} from "@/lib/server/purchase-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadCentralPo(id: string) {
  const [row] = await db.select().from(centralPurchaseOrders).where(eq(centralPurchaseOrders.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Central purchase order not found");
  return row;
}

// POST: Step 2 (Bill Upload) — same multipart/private-blob pattern as the
// branch PO's own bill upload route.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const origin = request.headers.get("origin");
    const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Same-origin request required");
    const actor = await requireIdentity(request);

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_DOCUMENT_BYTES + 65536) throw new HttpError(413, "File too large (max 8 MB)");

    let form: FormData;
    try { form = await request.formData(); } catch { throw new HttpError(400, "Multipart form data required"); }
    const file = form.get("bill");
    if (!(file instanceof File)) throw new HttpError(400, "A bill file is required");
    if (file.size > MAX_DOCUMENT_BYTES) throw new HttpError(413, "File too large (max 8 MB)");
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await validatePurchaseDocument(buffer);

    assertModule(actor, "PURCHASE_ORDER");
    const po = await loadCentralPo(id);
    assertCentralPoNotBilled(po.billUploadedAt);

    const pathname = billDocumentPathname(po.warehouseId, id, doc.ext);
    const stored = await uploadPurchaseDocument(pathname, buffer, doc.contentType);
    try {
      const result = await mutate(request, async (tx, mutateActor) => {
        assertModule(mutateActor, "PURCHASE_ORDER");
        const current = await loadCentralPo(id);
        assertCentralPoNotBilled(current.billUploadedAt);
        await tx.update(centralPurchaseOrders).set({ billBlobPathname: stored, billContentType: doc.contentType, billUploadedAt: new Date() }).where(eq(centralPurchaseOrders.id, id));
        const [row] = await tx.select().from(centralPurchaseOrders).where(eq(centralPurchaseOrders.id, id));
        return { purchaseOrder: row };
      });
      return json(result, 201);
    } catch (error) {
      await deletePurchaseDocument(stored);
      throw error;
    }
  });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const po = await loadCentralPo(id);
    if (!po.billBlobPathname) throw new HttpError(404, "No bill file uploaded for this purchase order");
    const url = await signedPurchaseDocumentUrl(po.billBlobPathname);
    return json({ url, contentType: po.billContentType, uploadedAt: po.billUploadedAt, expiresInSeconds: 300 });
  });
}
