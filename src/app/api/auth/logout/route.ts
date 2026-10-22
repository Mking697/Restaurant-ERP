import { eq } from "drizzle-orm";
import { sessions } from "@/db/schema/auth";
import { mutate, requestToken, SESSION_COOKIE, tokenHash } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) { return api(async () => {
  await mutate(request, async tx => { await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash(requestToken(request)))); });
  const response = json({ ok: true }); response.cookies.set(SESSION_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 }); return response;
}); }
