import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema/auth";
import { HttpError, safeUser, type Identity } from "./permissions";
import { assertSameOrigin } from "./http";
export const SESSION_COOKIE = "restaurant_session";
const TTL = 60 * 60 * 24 * 7;
export type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;
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
