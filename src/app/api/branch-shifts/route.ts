import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branchShifts } from "@/db/schema/shifts";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { lockShiftState, validateShiftDefinitions } from "@/lib/server/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Current ACTIVE shift windows for a branch. Owner can read any branch; a
// Branch Admin/Cashier only their own.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "SHIFT_MANAGEMENT");
    const branchId = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    if (!branchId) throw new HttpError(400, "Select a branch");
    const shifts = await db.select().from(branchShifts).where(and(eq(branchShifts.branchId, branchId), eq(branchShifts.isActive, true))).orderBy(branchShifts.sortOrder);
    return json({ shifts });
  });
}

// Replaces the FULL shift set for a branch (one-time setup, editable any
// time after). Past shift_runs keep referencing their original definition
// row — that row is only soft-deactivated (isActive=false), never deleted,
// so editing shift times never rewrites a run that already happened.
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "SHIFT_MANAGEMENT");
      if (actor.role !== "SUPER_ADMIN" && actor.role !== "BRANCH_MANAGER") throw new HttpError(403, "Only an Owner or Branch Admin can configure shifts");
      const input = await body(request);
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      if (!Array.isArray(input.shifts)) throw new HttpError(400, "shifts array required");
      const cleaned = validateShiftDefinitions(input.shifts as { label: string; startTime: string; endTime: string }[]);

      await lockShiftState(tx, branchId);
      await tx.update(branchShifts).set({ isActive: false, updatedAt: new Date() }).where(and(eq(branchShifts.branchId, branchId), eq(branchShifts.isActive, true)));
      const rows = cleaned.map((shift, i) => ({ id: randomUUID(), branchId, label: shift.label, startTime: shift.startTime, endTime: shift.endTime, sortOrder: i }));
      await tx.insert(branchShifts).values(rows);
      return rows;
    });
    return json({ shifts: result }, 201);
  });
}
