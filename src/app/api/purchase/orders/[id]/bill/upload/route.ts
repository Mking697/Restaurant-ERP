import { db } from "@/db/client";
import { purchaseOrders } from "@/db/schema/purchase";
import { eq } from "drizzle-orm";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/permissions";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { loadPo } from "../../../../_shared";
import { assertPoNotBilled } from "@/lib/server/purchase";
import {
  billDocumentPathname,
  deletePurchaseDocument,
  MAX_DOCUMENT_BYTES,
  signedPurchaseDocumentUrl,
  uploadPurchaseDocument,
  validatePurchaseDocument,
} from "@/lib/server/purchase-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: real file upload for Step 2 (Bill Upload) — multipart (not the
// shared JSON body() helper — this is a binary upload), same pattern as
// /api/tasks/instances/[id]/evidence/route.ts's EVIDENCE-1 work.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const origin = request.headers.get("origin");
    const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new HttpError(403, "Same-origin request required");
    }
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

    // Permission pre-check (non-authoritative — re-checked inside the locked
    // write below) so we don't waste a Blob upload on a request that will be
    // rejected anyway. Final branchId comes from the authoritative read.
    let branchId: string;
    {
      assertModule(actor, "PURCHASE_ORDER");
      const po = await loadPo(db, id);
      branchScope(actor, po.branchId);
      assertPoNotBilled(po.billUploadedAt);
      branchId = po.branchId;
    }

    const pathname = billDocumentPathname(branchId, id, doc.ext);
    const stored = await uploadPurchaseDocument(pathname, buffer, doc.contentType);

    try {
      const result = await mutate(request, async (tx, mutateActor) => {
        assertModule(mutateActor, "PURCHASE_ORDER");
        const po = await loadPo(tx, id);
        branchScope(mutateActor, po.branchId);
        assertPoNotBilled(po.billUploadedAt);
        await tx.update(purchaseOrders).set({ billBlobPathname: stored, billContentType: doc.contentType, billUploadedAt: new Date() }).where(eq(purchaseOrders.id, id));
        const [row] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
        return { purchaseOrder: row };
      });
      return json(result, 201);
    } catch (error) {
      await deletePurchaseDocument(stored);
      throw error;
    }
  });
}

// GET: short-lived signed URL to actually view the uploaded bill. Never a
// permanently public URL — the store is private, matching the evidence
// upload convention.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const po = await loadPo(db, id);
    branchScope(actor, po.branchId);
    if (!po.billBlobPathname) throw new HttpError(404, "No bill file uploaded for this purchase order");
    const url = await signedPurchaseDocumentUrl(po.billBlobPathname);
    return json({ url, contentType: po.billContentType, uploadedAt: po.billUploadedAt, expiresInSeconds: 300 });
  });
}
