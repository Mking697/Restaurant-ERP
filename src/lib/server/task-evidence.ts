import { randomUUID } from "node:crypto";
import { del, put, issueSignedToken, presignUrl } from "@vercel/blob";
import sharp from "sharp";
import { HttpError } from "./permissions";

// ---------------------------------------------------------------------------
// EVIDENCE-1: real camera-photo upload to the private Vercel Blob store
// (`restaurant-erp-evidence`), real GPS geofence computation, and real
// short-lived signed-URL read access. Same validation-rigor convention as
// `branding-input.ts`'s `normalizeLogo()` (declared MIME must match the
// actual magic-byte signature, decode with `sharp` to reject corrupt/
// decompression-bomb files, bounded size) but WITHOUT recompressing the
// photo — unlike a branding logo, an evidence photo is the actual record,
// not a decorative asset, so the original bytes are stored byte-for-byte.
// ---------------------------------------------------------------------------

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024; // 8 MB cap per the brief
export const EVIDENCE_ERROR = "Use a valid, non-animated PNG, JPEG or WebP photo up to 8 MB";

type EvidenceImage = { contentType: string; ext: string };

/** Detects the real signature, independent of any client-declared MIME type. */
function detectSignature(buffer: Buffer): EvidenceImage | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { contentType: "image/png", ext: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
}

/** Same signature+decode rigor as the branding-logo upload path, no resize/recompress. */
export async function validateEvidenceImage(buffer: Buffer): Promise<EvidenceImage> {
  const invalid = () => new HttpError(400, EVIDENCE_ERROR);
  if (!buffer.length || buffer.length > MAX_EVIDENCE_BYTES) throw invalid();
  const signature = detectSignature(buffer);
  if (!signature) throw invalid();
  try {
    const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "warning", animated: true });
    const meta = await image.metadata();
    if (meta.format !== (signature.ext === "jpg" ? "jpeg" : signature.ext) || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height) throw invalid();
    if (meta.width * meta.height > 40_000_000) throw invalid();
    if (signature.ext === "png") {
      // Reject APNG the same way normalizeLogo() does — decoders can report one page anyway.
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

/** Haversine distance in metres. */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type GeofenceResult = { withinGeofence: boolean | null; distanceFromBranchM: number | null };

/**
 * FAILS OPEN: a branch with no real configured coordinates yet (sentinel
 * 0,0 — the default both the New Branch form and seed data use before an
 * Owner/Branch Admin sets a real location) or a submitter who denied/lacks
 * GPS permission (lat/lng both null) always returns withinGeofence: null —
 * never a fabricated true/false, and the caller must never block
 * completion on this. Never treat a null geofence result as a failure.
 */
export function computeGeofence(branch: { lat: string; lng: string; geofenceRadiusM: number }, lat: number | null, lng: number | null): GeofenceResult {
  const branchLat = Number(branch.lat), branchLng = Number(branch.lng);
  const branchConfigured = !(branchLat === 0 && branchLng === 0);
  if (!branchConfigured || lat === null || lng === null) return { withinGeofence: null, distanceFromBranchM: null };
  const distance = distanceMetres(branchLat, branchLng, lat, lng);
  return { withinGeofence: distance <= branch.geofenceRadiusM, distanceFromBranchM: distance };
}

/** Parses an optional client-submitted coordinate; invalid/missing -> null (fail open), never throws. */
export function parseOptionalCoordinate(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function evidencePathname(branchId: string, taskInstanceId: string, ext: string): string {
  return `evidence/${branchId}/${taskInstanceId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
}

export async function uploadEvidencePhoto(pathname: string, buffer: Buffer, contentType: string): Promise<string> {
  const blob = await put(pathname, buffer, { access: "private", contentType, addRandomSuffix: false });
  return blob.pathname;
}

export async function deleteEvidencePhoto(pathname: string): Promise<void> {
  try { await del(pathname); } catch { /* best-effort cleanup only */ }
}

/** Short-lived (5 minute) signed GET URL — never a permanent public URL for this private store. */
export async function signedEvidenceUrl(pathname: string): Promise<string> {
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil: Date.now() + 5 * 60 * 1000 });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil: Date.now() + 5 * 60 * 1000 });
  return presignedUrl;
}
