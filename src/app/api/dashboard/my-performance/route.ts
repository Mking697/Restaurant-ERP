import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/permissions";
import { getMyPerformance } from "@/lib/server/my-performance";
import { misCalendarWindow } from "@/lib/mis-period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentMonthStartEat() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return `${parts.slice(0, 7)}-01`;
}
function todayEat() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// GET /api/dashboard/my-performance?from=&to= — always the caller's OWN
// completion score (never another user's — assignedToId is always
// actor.id, no override param). Defaults to the current EAT calendar
// month. See src/lib/server/my-performance.ts for the scoring rule.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    const query = new URL(request.url).searchParams;
    const from = query.get("from") || currentMonthStartEat();
    const to = query.get("to") || todayEat();
    let window: { periodStart: string; periodEnd: string };
    try {
      window = misCalendarWindow(from, to);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "Invalid date range");
    }
    const result = await getMyPerformance(db, actor, window.periodStart, window.periodEnd);
    return json(result);
  });
}
