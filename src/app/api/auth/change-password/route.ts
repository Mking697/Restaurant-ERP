import { eq, sql } from "drizzle-orm";
import { users, sessions } from "@/db/schema/auth";
import { issueSession, mutate, setSession } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { HttpError, safeUser } from "@/lib/server/permissions";
import { hashPassword, validPassword, verifyPassword } from "@/lib/server/password";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Self-service password change for ANY logged-in user (not just Owner/Admin
// — no assertUserAdmin gate here, deliberately: changing your OWN password
// needs only your own current session + knowing your own current password,
// same authority model as the login form itself).
export async function POST(request: Request) { return api(async () => {
  const input = await body(request);
  const { oldPassword, newPassword, confirmPassword } = input;
  if (typeof oldPassword !== "string") throw new HttpError(400, "Current password required");
  if (newPassword !== confirmPassword) throw new HttpError(400, "New password and confirmation do not match");
  if (!validPassword(newPassword)) throw new HttpError(400, "New password must have at least 12 characters and at most 256 UTF-8 bytes");
  const result = await mutate(request, async (tx, actor) => {
    const [existing] = await tx.select().from(users).where(eq(users.id, actor.id)).limit(1);
    if (!existing) throw new HttpError(404, "User not found");
    const valid = await verifyPassword(oldPassword, existing.passwordHash);
    if (!valid) throw new HttpError(401, "Current password is incorrect");
    const passwordHash = await hashPassword(newPassword as string);
    // Bump tokenVersion (same convention as every other password/role reset)
    // so every OTHER device's existing session is revoked immediately; then
    // delete all sessions and issue one fresh one for THIS request only, so
    // the user changing their own password is not immediately logged out.
    const [row] = await tx.update(users).set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, actor.id)).returning();
    await tx.delete(sessions).where(eq(sessions.userId, actor.id));
    return { user: safeUser(row), token: await issueSession(tx, row) };
  });
  return setSession(json({ user: result.user }), result.token);
}); }
