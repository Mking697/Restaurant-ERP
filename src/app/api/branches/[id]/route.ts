import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branches } from "@/db/schema/platform";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { branchInput, branchLogoInput } from "@/lib/server/branches";
import { checkBranchDeletion } from "@/lib/server/branch-deletion";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, branchScope, HttpError } from "@/lib/server/permissions";
import { brandLogoUrl } from "@/lib/server/branches-branding";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: Context) { return api(async () => { const actor = await requireIdentity(request); const { id } = await context.params; branchScope(actor, id); const [branch] = await db.select().from(branches).where(eq(branches.id, id)); if (!branch) throw new HttpError(404, "Branch not found"); const { brandLogo, ...rest } = branch; return json({ branch: { ...rest, brandLogoUrl: brandLogoUrl(rest.id, brandLogo) } }); }); }
export async function PATCH(request: Request, context: Context) { return api(async () => { const { id } = await context.params;
  const payload = await body(request, 1450000); const brandLogo = await branchLogoInput(payload.logo);
  const branch = await mutate(request, async (tx, actor) => {
  // Branch admins can maintain their own branch details, never create/delete.
  branchScope(actor, id); if (actor.role !== "SUPER_ADMIN" && actor.role !== "BRANCH_MANAGER") throw new HttpError(403, "Branch administration required");
  const [existing] = await tx.select().from(branches).where(eq(branches.id, id)); if (!existing) throw new HttpError(404, "Branch not found");
  const values = branchInput({ ...existing, ...payload });
  if (actor.role !== "SUPER_ADMIN" && values.code !== existing.code) throw new HttpError(403, "Only owner may change branch code");
  if (actor.role !== "SUPER_ADMIN" && values.operatingConcept !== existing.operatingConcept) throw new HttpError(403, "Only owner may change operating concept");
  if (actor.role !== "SUPER_ADMIN" && (brandLogo !== undefined || values.brandName !== existing.brandName)) throw new HttpError(403, "Only owner may change brand name/logo");
  const [row] = await tx.update(branches).set({ ...values, ...(brandLogo === undefined ? {} : { brandLogo }), updatedAt: new Date() }).where(eq(branches.id, id)).returning(); return row;
}); const { brandLogo: savedLogo, ...rest } = branch; return json({ branch: { ...rest, brandLogoUrl: brandLogoUrl(rest.id, savedLogo) } }); }); }
export async function DELETE(request: Request, context: Context) { return api(async () => { const { id } = await context.params; await mutate(request, async (tx, actor) => {
  assertOwner(actor);
  const check = await checkBranchDeletion(tx, actor, id);
  if (!check.canDelete) throw new HttpError(409, "Linked records prevent deletion of this branch. No records were removed or reassigned. Check deletion readiness for dependency counts.");
  // Readiness is never a client authorization token. Recheck in this mutation;
  // the unchanged foreign keys remain final protection against concurrent links.
  const rows = await tx.delete(branches).where(eq(branches.id, id)).returning({ id: branches.id });
  if (!rows.length) throw new HttpError(404, "Branch not found");
}); return json({ ok: true }); }); }
