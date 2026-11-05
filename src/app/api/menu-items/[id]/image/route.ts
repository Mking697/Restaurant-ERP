import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuItems } from "@/db/schema/menu";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { deleteMenuImage, menuImagePathname, processMenuImage, uploadMenuImage, MAX_MENU_IMAGE_BYTES } from "@/lib/server/menu-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadItem(id: string) {
  const [row] = await db.select({ id: menuItems.id, branchId: menuItems.branchId, imageUrl: menuItems.imageUrl }).from(menuItems).where(eq(menuItems.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Menu item not found");
  return row;
}

// POST: real dish-photo upload (multipart, binary) — MENU_BOM-only, same as
// recipe/menu-item writes. Replaces (and best-effort deletes) any prior photo.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const origin = request.headers.get("origin");
    const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Same-origin request required");
    const actor = await requireIdentity(request);
    assertModule(actor, "MENU_BOM");

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_MENU_IMAGE_BYTES + 65536) throw new HttpError(413, "Photo too large (max 8 MB)");

    let form: FormData;
    try { form = await request.formData(); } catch { throw new HttpError(400, "Multipart form data required"); }
    const file = form.get("photo");
    if (!(file instanceof File)) throw new HttpError(400, "A photo file is required");
    if (file.size > MAX_MENU_IMAGE_BYTES) throw new HttpError(413, "Photo too large (max 8 MB)");
    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await processMenuImage(buffer);

    // Non-authoritative pre-check so we don't waste an upload on a request
    // that will be rejected anyway; the final branchId/old image come from
    // the authoritative read inside the locked write below.
    const existing = await loadItem(id);
    branchScope(actor, existing.branchId);

    const pathname = menuImagePathname(existing.branchId, id);
    const url = await uploadMenuImage(pathname, processed);

    try {
      const result = await mutate(request, async (tx, mutateActor) => {
        assertModule(mutateActor, "MENU_BOM");
        const [row] = await tx.select({ id: menuItems.id, branchId: menuItems.branchId, imageUrl: menuItems.imageUrl }).from(menuItems).where(eq(menuItems.id, id)).limit(1);
        if (!row) throw new HttpError(404, "Menu item not found");
        branchScope(mutateActor, row.branchId);
        const now = new Date();
        await tx.update(menuItems).set({ imageUrl: url, imageUpdatedAt: now }).where(eq(menuItems.id, id));
        return { imageUrl: url, imageUpdatedAt: now.toISOString(), previousImageUrl: row.imageUrl };
      });
      if (result.previousImageUrl && result.previousImageUrl !== url) await deleteMenuImage(result.previousImageUrl);
      return json({ imageUrl: result.imageUrl, imageUpdatedAt: result.imageUpdatedAt }, 200);
    } catch (error) {
      // The DB write failed/was rejected after the blob already landed —
      // clean up the orphaned object so no unlinked photo lingers.
      await deleteMenuImage(url);
      throw error;
    }
  });
}

// DELETE: removes the current photo (best-effort blob cleanup), never
// invents a placeholder — null means "no photo" again, same as never uploaded.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "MENU_BOM");
      const [row] = await tx.select({ id: menuItems.id, branchId: menuItems.branchId, imageUrl: menuItems.imageUrl }).from(menuItems).where(eq(menuItems.id, id)).limit(1);
      if (!row) throw new HttpError(404, "Menu item not found");
      branchScope(actor, row.branchId);
      await tx.update(menuItems).set({ imageUrl: null, imageUpdatedAt: null }).where(eq(menuItems.id, id));
      return { previousImageUrl: row.imageUrl };
    });
    if (result.previousImageUrl) await deleteMenuImage(result.previousImageUrl);
    return json({ imageUrl: null }, 200);
  });
}
