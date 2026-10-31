import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/permissions";
import { assertModule } from "@/lib/server/permissions";
import { createVendorInvoice, readPoInvoice } from "@/lib/server/vendor-invoices";
import {
  deletePurchaseDocument,
  invoiceDocumentPathname,
  MAX_DOCUMENT_BYTES,
  signedPurchaseDocumentUrl,
  uploadPurchaseDocument,
  validatePurchaseDocument,
} from "@/lib/server/purchase-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/orders/[id]/invoice — Step: record the vendor invoice
// + any store-side tax adjustment, and compute the real 3-way match (PO vs
// GRN accepted value vs invoice adjusted amount). Multipart: invoiceNumber,
// amount, taxAdjustmentInr (optional), taxAdjustmentNote (optional), and an
// OPTIONAL "invoice" file (a vendor invoice doesn't always arrive as a
// scannable document at data-entry time).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const origin = request.headers.get("origin");
    const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new HttpError(403, "Same-origin request required");
    }
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_DOCUMENT_BYTES + 65536) throw new HttpError(413, "File too large (max 8 MB)");

    let form: FormData;
    try { form = await request.formData(); } catch { throw new HttpError(400, "Multipart form data required"); }
    const input: Record<string, unknown> = {
      invoiceNumber: form.get("invoiceNumber"),
      amount: form.get("amount"),
    };
    if (form.has("taxAdjustmentInr")) input.taxAdjustmentInr = form.get("taxAdjustmentInr");
    if (form.has("taxAdjustmentNote")) input.taxAdjustmentNote = form.get("taxAdjustmentNote");

    const file = form.get("invoice");
    if (file instanceof File && file.size > MAX_DOCUMENT_BYTES) throw new HttpError(413, "File too large (max 8 MB)");

    let stored = "";
    try {
      const result = await mutate(request, async (tx, mutateActor) => {
        let blobPathname = "", contentType = "";
        if (file instanceof File && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const doc = await validatePurchaseDocument(buffer);
          const pathname = invoiceDocumentPathname(mutateActor.branchId ?? "hq", id, doc.ext);
          stored = await uploadPurchaseDocument(pathname, buffer, doc.contentType);
          blobPathname = stored;
          contentType = doc.contentType;
        }
        return createVendorInvoice(tx, mutateActor, id, input, { blobPathname, contentType, photoUrl: "" });
      });
      return json(result, 201);
    } catch (error) {
      if (stored) await deletePurchaseDocument(stored);
      throw error;
    }
  });
}

// GET /api/purchase/orders/[id]/invoice — the recorded invoice + 3-way match
// state for this PO, plus a short-lived signed URL if a document was uploaded.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const result = await readPoInvoice(db, actor, id);
    if (!result.invoice) return json(result);
    const url = result.invoice.blobPathname ? await signedPurchaseDocumentUrl(result.invoice.blobPathname) : null;
    return json({ ...result, documentUrl: url });
  });
}
