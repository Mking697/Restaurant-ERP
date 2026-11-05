import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { HttpError } from "./permissions";

// ---------------------------------------------------------------------------
// GAP-028: real dish-photo upload for the POS touch-tile picker, to a PUBLIC
// Vercel Blob store (`restaurant-erp-menu-images`) — unlike purchase/task
// evidence, a dish photo is a decorative customer-visible asset, not private
// evidence, so a plain public URL (no signed-URL machinery) is correct here.
// Same signature+decode validation rigor as branding-input.ts's
// normalizeLogo() / task-evidence.ts's validateEvidenceImage(), plus the
// same resize-and-recompress-to-JPEG step as normalizeLogo() so every tile
// loads a small, consistent thumbnail regardless of the original photo size.
// ---------------------------------------------------------------------------

export const MAX_MENU_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB cap, same ceiling as other uploads
export const MENU_IMAGE_ERROR = "Use a valid, non-animated PNG, JPEG or WebP photo up to 8 MB";

function detectSignature(buffer: Buffer): { ext: "png" | "jpg" | "webp" } | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: "png" };
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { ext: "jpg" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { ext: "webp" };
  return null;
}

/** Validates, then resizes/recompresses to a consistent JPEG thumbnail (max 640x640). */
export async function processMenuImage(buffer: Buffer): Promise<Buffer> {
  const invalid = () => new HttpError(400, MENU_IMAGE_ERROR);
  if (!buffer.length || buffer.length > MAX_MENU_IMAGE_BYTES) throw invalid();
  const signature = detectSignature(buffer);
  if (!signature) throw invalid();
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
    return await sharp(buffer).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalid();
  }
}

export function menuImagePathname(branchId: string, menuItemId: string): string {
  return `menu-images/${branchId}/${menuItemId}/${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
}

export async function uploadMenuImage(pathname: string, buffer: Buffer): Promise<string> {
  const blob = await put(pathname, buffer, { access: "public", contentType: "image/jpeg", addRandomSuffix: false });
  return blob.url;
}

/** Best-effort cleanup only — accepts either a pathname or a full public URL. */
export async function deleteMenuImage(target: string): Promise<void> {
  try { await del(target); } catch { /* best-effort cleanup only */ }
}
