import { eq } from "drizzle-orm";
import { users } from "@/db/schema/auth";
import { issueSession, locked, setSession } from "@/lib/server/auth";
import { api, assertSameOrigin, body, json, phone } from "@/lib/server/http";
import { HttpError, safeUser } from "@/lib/server/permissions";
import { verifyPassword } from "@/lib/server/password";
export const runtime = "nodejs";
// Local-instance guard; production multi-instance deployments need shared throttling.
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) { return api(async () => {
  assertSameOrigin(request); const input = await body(request); const phoneE164 = phone(input.phoneE164);
  if (typeof input.password !== "string" || Buffer.byteLength(input.password) > 256) throw new HttpError(400, "Invalid password");
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
  if (attempts.size > 10000) throw new HttpError(429, "Login temporarily limited");
  const entry = attempts.get(phoneE164) ?? { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 10) throw new HttpError(429, "Too many attempts; try later");
  entry.count++; attempts.set(phoneE164, entry);
  const result = await locked(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.phoneE164, phoneE164)).limit(1);
    const valid = await verifyPassword(input.password as string, user?.passwordHash ?? null);
    if (!user || !valid || user.status !== "Active") throw new HttpError(401, "Invalid credentials");
    return { user: safeUser(user), token: await issueSession(tx, user) };
  });
  attempts.delete(phoneE164);
  return setSession(json({ user: result.user }), result.token);
}); }
