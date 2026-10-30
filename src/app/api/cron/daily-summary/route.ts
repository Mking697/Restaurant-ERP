import { validCronSecret } from "@/lib/server/cron-auth";
import { runDailySummary } from "@/lib/server/daily-summary";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Machine-to-machine cron trigger ONLY, same bearer-secret convention as
// POST /api/cron/tasks (src/lib/server/cron-auth.ts) — no session/cookie
// auth accepted here either. Scheduled daily (~8AM, see vercel.json) at a
// DIFFERENT hour than the existing tasks cron, per this Vercel plan's
// daily-only cron-frequency limit.
export async function POST(request: Request) {
  if (!validCronSecret(request)) return json({ error: "Unauthorized" }, 401);
  try {
    const result = await runDailySummary(new Date());
    return json(result, 200);
  } catch {
    // Never return database details, SQL, or secret material.
    return json({ error: "Database or server unavailable" }, 503);
  }
}

// Vercel Cron invokes GET; manual POST callers retain the identical auth
// and idempotency guarantees. Never expose an unauthenticated tick.
export const GET = POST;
