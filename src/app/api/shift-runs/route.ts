import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shiftHandovers, shiftRuns } from "@/db/schema/shifts";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { branchScope, HttpError, hasModule, type Identity } from "@/lib/server/permissions";
import { startFirstShift } from "@/lib/server/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertOperational(actor: Identity) {
  if (!hasModule(actor, "POS_CASHIER") && !hasModule(actor, "CASH_DROP") && !hasModule(actor, "SHIFT_MANAGEMENT")) {
    throw new HttpError(403, "POS, Cash Drop or Shift Management access required");
  }
}

// Current OPEN shift run for a branch + whether a handover to it is still
// PENDING acceptance — the gate both /pos and /cash-drop pages check before
// letting the cashier do anything for the current run.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertOperational(actor);
    const branchId = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    if (!branchId) throw new HttpError(400, "Select a branch");
    const [run] = await db.select().from(shiftRuns).where(and(eq(shiftRuns.branchId, branchId), eq(shiftRuns.status, "OPEN"))).orderBy(desc(shiftRuns.startedAt)).limit(1);
    if (!run) return json({ run: null, pendingHandover: null });
    const [pendingHandover] = await db.select().from(shiftHandovers).where(and(eq(shiftHandovers.toRunId, run.id), eq(shiftHandovers.status, "PENDING"))).limit(1);
    return json({ run, pendingHandover: pendingHandover ?? null });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const run = await mutate(request, async (tx, actor) => {
      assertOperational(actor);
      const input = await body(request);
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      return startFirstShift(tx, actor, branchId);
    });
    return json({ run }, 201);
  });
}
