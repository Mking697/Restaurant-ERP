import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/permissions";
import {
  getTaskProof,
  loadBranchForGeofence,
  loadInstanceForEvidence,
  upsertTaskProof,
} from "@/lib/server/tasks";
import {
  computeGeofence,
  deleteEvidencePhoto,
  evidencePathname,
  parseOptionalCoordinate,
  signedEvidenceUrl,
  uploadEvidencePhoto,
  validateEvidenceImage,
  MAX_EVIDENCE_BYTES,
} from "@/lib/server/task-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: real camera-photo upload for a ONE_TIME task's completion evidence.
// Multipart (not the shared JSON body() helper — this is a binary upload),
// so same-origin + auth are checked explicitly before reading the form.
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
    if (contentLength > MAX_EVIDENCE_BYTES + 65536) throw new HttpError(413, "Photo too large (max 8 MB)");

    let form: FormData;
    try { form = await request.formData(); } catch { throw new HttpError(400, "Multipart form data required"); }
    const file = form.get("photo");
    if (!(file instanceof File)) throw new HttpError(400, "A photo file is required");
    if (file.size > MAX_EVIDENCE_BYTES) throw new HttpError(413, "Photo too large (max 8 MB)");
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await validateEvidenceImage(buffer);

    // Best-effort client geolocation — missing/denied is explicitly allowed (fail open).
    const lat = parseOptionalCoordinate(form.get("lat"), -90, 90);
    const lng = parseOptionalCoordinate(form.get("lng"), -180, 180);

    // Permission pre-check (non-authoritative — re-checked inside the locked
    // write below) so we don't waste a Blob upload on a request that will
    // be rejected anyway. Final branchId comes from the authoritative read.
    let branchId: string;
    {
      const row = await loadInstanceForEvidence(db, actor, id, "write");
      branchId = row.branchId;
    }

    const pathname = evidencePathname(branchId, id, image.ext);
    const stored = await uploadEvidencePhoto(pathname, buffer, image.contentType);

    try {
      const result = await mutate(request, async (tx, mutateActor) => {
        const row = await loadInstanceForEvidence(tx, mutateActor, id, "write");
        const branch = await loadBranchForGeofence(tx, row.branchId);
        const geofence = computeGeofence(branch, lat, lng);
        const proof = await upsertTaskProof(tx, id, stored, geofence, lat, lng);
        return { proof };
      });
      return json(result, 201);
    } catch (error) {
      // The DB write failed/was rejected after the blob already landed —
      // clean up the orphaned object so no test/real photo lingers unlinked.
      await deleteEvidencePhoto(stored);
      throw error;
    }
  });
}

// GET: short-lived signed URL to actually view the evidence photo. Never a
// permanently public URL — the store is private, matching the brief.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const actor = await requireIdentity(request);
    await loadInstanceForEvidence(db, actor, id, "read");
    const proof = await getTaskProof(db, id);
    if (!proof) throw new HttpError(404, "No evidence uploaded for this task");
    const url = await signedEvidenceUrl(proof.photoUrl);
    return json({
      url,
      withinGeofence: proof.withinGeofence,
      distanceFromBranchM: proof.distanceFromBranchM,
      createdAt: proof.createdAt,
      expiresInSeconds: 300,
    });
  });
}
