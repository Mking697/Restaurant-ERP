import { eq } from "drizzle-orm";
import { users } from "@/db/schema/auth";
import { checkLoginThrottle, clearLoginThrottle, issueSession, locked, setSession } from "@/lib/server/auth";
import { api, assertSameOrigin, body, json, phone } from "@/lib/server/http";
import { HttpError, safeUser } from "@/lib/server/permissions";
import { verifyPassword } from "@/lib/server/password";
export const runtime = "nodejs";

// Best-effort source IP for the secondary throttle key — trusts the platform's
// own edge-set header (Vercel/most proxies), never a client-controlled one
// alone for anything security-critical beyond this rate-limit heuristic.
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0].trim()) || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) { return api(async () => {
  assertSameOrigin(request); const input = await body(request); const phoneE164 = phone(input.phoneE164);
  if (typeof input.password !== "string" || Buffer.byteLength(input.password) > 256) throw new HttpError(400, "Invalid password");
  const ip = clientIp(request);
  // Record/check the throttle in its OWN transaction that always commits —
  // checkLoginThrottle never throws inside the transaction (see its comment);
  // we decide whether to reject only after this transaction has committed.
  const blocked = await locked(async tx => {
    const phoneBlocked = await checkLoginThrottle(tx, `phone:${phoneE164}`, 10);
    const ipBlocked = await checkLoginThrottle(tx, `ip:${ip}`, 30);
    return phoneBlocked || ipBlocked;
  });
  if (blocked) throw new HttpError(429, "Too many attempts; try later");
  const result = await locked(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.phoneE164, phoneE164)).limit(1);
    const valid = await verifyPassword(input.password as string, user?.passwordHash ?? null);
    if (!user || !valid || user.status !== "Active") throw new HttpError(401, "Invalid credentials");
    await clearLoginThrottle(tx, `phone:${phoneE164}`);
    return { user: safeUser(user), token: await issueSession(tx, user) };
  });
  return setSession(json({ user: result.user }), result.token);
}); }
