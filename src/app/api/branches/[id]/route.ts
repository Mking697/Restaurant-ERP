import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branches } from "@/db/schema/platform";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { branchInput } from "@/lib/server/branches";
import { checkBranchDeletion } from "@/lib/server/branch-deletion";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, branchScope, HttpError } from "@/lib/server/permissions";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: Context) { return api(async () => { const actor = await requireIdentity(request); const { id } = await context.params; branchScope(actor, id); const [branch] = await db.select().from(branches).where(eq(branches.id, id)); if (!branch) throw new HttpError(404, "Branch not found"); return json({ branch }); }); }
export async function PATCH(request: Request, context: Context) { return api(async () => { const { id } = await context.params; const branch = await mutate(request, async (tx, actor) => {
  // Branch admins can maintain their own branch details, never create/delete.
  branchScope(actor, id); if (actor.role !== "SUPER_ADMIN" && actor.role !== "BRANCH_MANAGER") throw new HttpError(403, "Branch administration required");
  const [existing] = await tx.select().from(branches).where(eq(branches.id, id)); if (!existing) throw new HttpError(404, "Branch not found");
  const input = await body(request); const values = branchInput({ ...existing, ...input });
  if (actor.role !== "SUPER_ADMIN" && values.code !== existing.code) throw new HttpError(403, "Only owner may change branch code");
  const [row] = await tx.update(branches).set({ ...values, updatedAt: new Date() }).where(eq(branches.id, id)).returning(); return row;
}); return json({ branch }); }); }
export async function DELETE(request: Request, context: Context) { return api(async () => { const { id } = await context.params; await mutate(request, async (tx, actor) => {
  assertOwner(actor);
  const check = await checkBranchDeletion(tx, actor, id);
  if (!check.canDelete) throw new HttpError(409, "Linked records prevent deletion of this branch. No records were removed or reassigned. Check deletion readiness for dependency counts.");
  // Readiness is never a client authorization token. Recheck in this mutation;
  // the unchanged foreign keys remain final protection against concurrent links.
  const rows = await tx.delete(branches).where(eq(branches.id, id)).returning({ id: branches.id });
  if (!rows.length) throw new HttpError(404, "Branch not found");
}); return json({ ok: true }); }); }
