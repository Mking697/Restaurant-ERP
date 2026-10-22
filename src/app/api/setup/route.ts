import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { MODULE_KEYS } from "@/lib/moduleAccess";
import { issueSession, locked, setSession } from "@/lib/server/auth";
import { api, assertSameOrigin, body, json, phone, string } from "@/lib/server/http";
import { HttpError, safeUser } from "@/lib/server/permissions";
import { hashPassword, validPassword } from "@/lib/server/password";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// "Setup required" means no OWNER exists yet — not "database is empty".
// Demo/staff rows can legitimately be seeded before the real Owner signs up
// (e.g. a client-demo data seed), and that must not block Owner bootstrap.
export async function GET() { return api(async () => { const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "SUPER_ADMIN")).limit(1); return json({ setupRequired: rows.length === 0 }); }); }
export async function POST(request: Request) { return api(async () => {
  assertSameOrigin(request);
  const input = await body(request);
  const name = string(input.name, "name"); const phoneE164 = phone(input.phoneE164);
  if (!validPassword(input.password)) throw new HttpError(400, "Password must have at least 12 characters and at most 256 UTF-8 bytes");
  const passwordHash = await hashPassword(input.password);
  const result = await locked(async tx => {
    if ((await tx.select({ id: users.id }).from(users).where(eq(users.role, "SUPER_ADMIN")).limit(1)).length) throw new HttpError(409, "Setup already completed");
    const [user] = await tx.insert(users).values({ id: randomUUID(), name, phoneE164, passwordHash, role: "SUPER_ADMIN", branchId: null, moduleAccess: [...MODULE_KEYS] }).returning();
    return { user: safeUser(user), token: await issueSession(tx, user) };
  });
  return setSession(json({ user: result.user }, 201), result.token);
}); }
