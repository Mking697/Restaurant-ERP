import sharp from "sharp";
import { HttpError } from "./permissions";
export const MAX_LOGO_BYTES = 1024 * 1024;
export const BRANDING_BODY_BYTES = 1450000;
export const LOGO_ERROR = "Use a valid, non-animated PNG, JPEG or WebP up to 1 MB and 4 million pixels";
export function restaurantName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100 || /[\x00-\x1f\x7f]/.test(value)) throw new HttpError(400, "Enter a restaurant name (1–100 characters)");
  return value.trim();
}
/** Only a declared MIME + strict base64 payload is accepted. Never decode SVG. */
export async function normalizeLogo(value: unknown): Promise<string> {
  const invalid = () => new HttpError(400, LOGO_ERROR);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const { type, data } = value as Record<string, unknown>;
  if (typeof type !== "string" || !["image/png", "image/jpeg", "image/webp"].includes(type) || typeof data !== "string" || data.length > 1398104 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw invalid();
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > MAX_LOGO_BYTES || buffer.toString("base64") !== data) throw invalid();
  const signature = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png" : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 ? "jpeg" : buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" ? "webp" : "";
  if (type !== `image/${signature}`) throw invalid();
  try {
    const image = sharp(buffer, { limitInputPixels: 4000000, failOn: "warning", animated: true });
    const meta = await image.metadata();
    if (meta.format !== signature || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width * meta.height > 4000000) throw invalid();
    // APNG's animation control chunk is rejected even on decoders reporting one page.
    if (signature === "png") {
      for (let i = 8; i + 12 <= buffer.length;) {
        const length = buffer.readUInt32BE(i);
        if (buffer.toString("ascii", i + 4, i + 8) === "acTL") throw invalid();
        i += length + 12;
      }
    }
    const png = await image.rotate().resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).png({ palette: true, colours: 128, compressionLevel: 9 }).toBuffer();
    if (png.length > 128 * 1024) throw invalid();
    return png.toString("base64");
  } catch { throw invalid(); }
}
export async function brandingInput(input: Record<string, unknown>, setup = false) {
  const name = restaurantName(input.restaurantName);
  // undefined preserves the existing logo on edit; null explicitly removes it.
  const logo = input.logo === undefined ? (setup ? "" : undefined) : input.logo === null ? "" : await normalizeLogo(input.logo);
  return { name, logo };
}
