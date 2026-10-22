import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users, sessions } from "@/db/schema/auth";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertUserAdmin, branchScope, HttpError, safeUser } from "@/lib/server/permissions";
import { userInput } from "@/lib/server/users";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: Context) { return api(async () => {
  const actor = await requireIdentity(request); assertUserAdmin(actor); const { id } = await context.params;
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user || (actor.role !== "SUPER_ADMIN" && user.branchId !== actor.branchId)) throw new HttpError(404, "User not found");
  branchScope(actor, user.branchId); return json({ user: safeUser(user) });
}); }
export async function PATCH(request: Request, context: Context) { return api(async () => {
  const { id } = await context.params;
  const user = await mutate(request, async (tx, actor) => {
    assertUserAdmin(actor); const [existing] = await tx.select().from(users).where(eq(users.id, id));
    if (!existing || (actor.role !== "SUPER_ADMIN" && existing.branchId !== actor.branchId)) throw new HttpError(404, "User not found");
    const input = await userInput(tx, actor, await body(request), existing);
    const [row] = await tx.update(users).set({ ...input, tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, id)).returning();
    await tx.delete(sessions).where(eq(sessions.userId, id));
    return safeUser(row);
  });
  return json({ user });
}); }
