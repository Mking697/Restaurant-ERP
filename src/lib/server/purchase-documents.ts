import { randomUUID } from "node:crypto";
import { del, put, issueSignedToken, presignUrl } from "@vercel/blob";
import sharp from "sharp";
import { HttpError } from "./permissions";

// ---------------------------------------------------------------------------
// Real file upload for Purchase documents (PO bill, vendor invoice) to the
// private Vercel Blob store (`restaurant-erp-purchase-docs`) — same
// validation rigor and private-store/signed-URL convention as
// task-evidence.ts's EVIDENCE-1 work, extended to also accept PDF (a bill or
// vendor invoice is very commonly a PDF, unlike task evidence which is
// always a camera photo).
// ---------------------------------------------------------------------------

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MB cap, same ceiling as evidence photos
export const DOCUMENT_ERROR = "Use a valid PNG, JPEG, WebP or PDF file up to 8 MB";

type PurchaseDocument = { contentType: string; ext: string };

function detectSignature(buffer: Buffer): PurchaseDocument | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { contentType: "image/png", ext: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { contentType: "image/webp", ext: "webp" };
  }
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return { contentType: "application/pdf", ext: "pdf" };
  }
  return null;
}

/** Same signature+decode rigor as task-evidence.ts's validateEvidenceImage, plus a real PDF magic-byte check. */
export async function validatePurchaseDocument(buffer: Buffer): Promise<PurchaseDocument> {
  const invalid = () => new HttpError(400, DOCUMENT_ERROR);
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) throw invalid();
  const signature = detectSignature(buffer);
  if (!signature) throw invalid();
  if (signature.ext === "pdf") {
    // No decode library here (no PDF renderer dependency in this project) —
    // the magic-byte check plus an %%EOF trailer within the last 2KB is the
    // same bounded-confidence check used by many upload pipelines that don't
    // fully parse PDFs; still rejects obviously-truncated/non-PDF files.
    const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString("latin1");
    if (!tail.includes("%%EOF")) throw invalid();
    return signature;
  }
  try {
    const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "warning", animated: true });
    const meta = await image.metadata();
    if (meta.format !== (signature.ext === "jpg" ? "jpeg" : signature.ext) || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height) throw invalid();
    if (meta.width * meta.height > 40_000_000) throw invalid();
    if (signature.ext === "png") {
      for (let i = 8; i + 12 <= buffer.length;) {
        const length = buffer.readUInt32BE(i);
        if (buffer.toString("ascii", i + 4, i + 8) === "acTL") throw invalid();
        i += length + 12;
      }
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalid();
  }
  return signature;
}

export function billDocumentPathname(branchId: string, poId: string, ext: string): string {
  return `purchase-docs/bills/${branchId}/${poId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
}

export function invoiceDocumentPathname(branchId: string, poId: string, ext: string): string {
  return `purchase-docs/invoices/${branchId}/${poId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
}

export async function uploadPurchaseDocument(pathname: string, buffer: Buffer, contentType: string): Promise<string> {
  const blob = await put(pathname, buffer, { access: "private", contentType, addRandomSuffix: false });
  return blob.pathname;
}

export async function deletePurchaseDocument(pathname: string): Promise<void> {
  try { await del(pathname); } catch { /* best-effort cleanup only */ }
}

/** Short-lived (5 minute) signed GET URL — never a permanent public URL for this private store. */
export async function signedPurchaseDocumentUrl(pathname: string): Promise<string> {
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil: Date.now() + 5 * 60 * 1000 });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil: Date.now() + 5 * 60 * 1000 });
  return presignedUrl;
}
