import { createHash, timingSafeEqual } from "node:crypto";
import { locked } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { escalateOverdueInstances, generateRecurringOccurrences } from "@/lib/server/task-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Machine-to-machine cron trigger ONLY. Authorization is a single shared
// secret (new env var CRON_SECRET, never logged/returned) compared via a
// fixed-length digest + timingSafeEqual — this never branches on the raw
// provided/secret length, matching the existing timing-safe convention in
// src/lib/server/password.ts. No session/cookie auth is read or accepted
// here at all, by construction: this function never looks at the `cookie`
// header or calls requireIdentity — any browser session, regardless of
// role, is simply irrelevant to this endpoint.
function validCronSecret(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false; // fail closed if misconfigured
  const providedDigest = createHash("sha256").update(provided).digest();
  const secretDigest = createHash("sha256").update(secret).digest();
  return timingSafeEqual(providedDigest, secretDigest);
}

export async function POST(request: Request) {
  if (!validCronSecret(request)) return json({ error: "Unauthorized" }, 401);
  try {
    const now = new Date();
    // Same existing pg_advisory_xact_lock-backed transaction every other
    // mutation in this app uses — serializes concurrent cron ticks (e.g. two
    // overlapping Vercel Cron invocations) at the database itself, on top of
    // the unique-constraint/WHERE-guarded idempotency inside each function.
    const result = await locked(async (tx) => {
      const generated = await generateRecurringOccurrences(tx, now);
      const escalated = await escalateOverdueInstances(tx, now);
      return { generated, escalated };
    });
    return json(result, 200);
  } catch {
    // Never return database details, SQL, or secret material.
    return json({ error: "Database or server unavailable" }, 503);
  }
}
