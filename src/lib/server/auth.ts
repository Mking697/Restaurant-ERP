import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { loginAttempts, sessions, users } from "@/db/schema/auth";
import { HttpError, safeUser, type Identity } from "./permissions";
import { assertSameOrigin } from "./http";
export const SESSION_COOKIE = "restaurant_session";
const TTL = 60 * 60 * 24 * 7;
export type Executor = Pick<typeof db, "select" | "selectDistinct" | "insert" | "update" | "delete" | "execute">;
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function requestToken(request: Request) {
  return request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1) ?? "";
}
export async function requireIdentity(request?: Request, executor: Executor = db): Promise<Identity> {
  const token = request ? requestToken(request) : (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, "Authentication required");
  const [row] = await executor.select({ user: users, version: sessions.tokenVersion }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!row || row.user.status !== "Active" || row.version !== row.user.tokenVersion) throw new HttpError(401, "Session expired or revoked");
  return safeUser(row.user);
}
export async function issueSession(executor: Executor, user: typeof users.$inferSelect) {
  const token = randomBytes(32).toString("hex");
  await executor.insert(sessions).values({ tokenHash: tokenHash(token), userId: user.id, tokenVersion: user.tokenVersion, expiresAt: new Date(Date.now() + TTL * 1000) });
  return token;
}
export function setSession(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL });
  return response;
}
// All foundation mutations share one xact lock: bootstrap, role changes, sessions,
// and scoped writes resolve their live actor AFTER locking. No stale-authority write.
export async function locked<T>(action: (tx: Executor) => Promise<T>) {
  return db.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(726431, 1)`); return action(tx); });
}
export async function mutate<T>(request: Request, action: (tx: Executor, actor: Identity) => Promise<T>) {
  assertSameOrigin(request);
  return locked(async tx => action(tx, await requireIdentity(request, tx)));
}

// Shared Postgres-backed brute-force throttle (security audit H2/L1/L2).
// Call from inside an existing `locked()` transaction so the global advisory
// lock already serializes concurrent callers — a plain read-then-write here
// is race-free, no extra row-level locking needed. Returns true if blocked
// — deliberately does NOT throw itself: throwing inside the same Postgres
// transaction as the write would roll back that very write (the write that
// records the block), so the write must commit first and the caller decides
// whether to reject only after this transaction has committed.
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export async function checkLoginThrottle(tx: Executor, key: string, limit: number): Promise<boolean> {
  const now = new Date();
  // Opportunistic cleanup so an attacker spraying many distinct keys cannot
  // grow this table unboundedly (audit L2) — cheap, runs on ~1% of calls.
  if (Math.random() < 0.01) {
    await tx.delete(loginAttempts).where(lt(loginAttempts.windowStart, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  }
  const [row] = await tx.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1);
  if (!row) {
    await tx.insert(loginAttempts).values({ key, count: 1, windowStart: now, blockedUntil: null });
    return false;
  }
  if (row.blockedUntil && row.blockedUntil > now) return true;
  if (now.getTime() - row.windowStart.getTime() > THROTTLE_WINDOW_MS) {
    await tx.update(loginAttempts).set({ count: 1, windowStart: now, blockedUntil: null }).where(eq(loginAttempts.key, key));
    return false;
  }
  if (row.count >= limit) {
    await tx.update(loginAttempts).set({ blockedUntil: new Date(now.getTime() + THROTTLE_WINDOW_MS) }).where(eq(loginAttempts.key, key));
    return true;
  }
  await tx.update(loginAttempts).set({ count: row.count + 1 }).where(eq(loginAttempts.key, key));
  return false;
}
export async function clearLoginThrottle(tx: Executor, key: string) {
  await tx.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
