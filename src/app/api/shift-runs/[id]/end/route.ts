import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { branchScope, HttpError, hasModule, type Identity } from "@/lib/server/permissions";
import { endShiftAndHandover } from "@/lib/server/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertOperational(actor: Identity) {
  if (!hasModule(actor, "POS_CASHIER") && !hasModule(actor, "CASH_DROP") && !hasModule(actor, "SHIFT_MANAGEMENT")) {
    throw new HttpError(403, "POS, Cash Drop or Shift Management access required");
  }
}
function count(value: unknown, field: string) {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, `Invalid ${field}`);
  return n;
}

function coinAmount(value: unknown) {
  const text = String(value ?? 0);
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text) || Number(text) > 100000) throw new HttpError(400, "Invalid coinsInr");
  return Number(text);
}

// Ends the given OPEN run — the cashier submits a BLIND denomination
// count (same shape as the Blind Cash Drop form; expected cash is computed
// server-side from this run's own POS orders, never shown beforehand). This
// is the single action that both closes the run and hands its totals over
// to the automatically-opened next shift in the cycle.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => {
      assertOperational(actor);
      const input = await body(request);
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      const denominations = {
        note500Count: count(input.note500Count, "note500Count"),
        note200Count: count(input.note200Count, "note200Count"),
        note100Count: count(input.note100Count, "note100Count"),
        note50Count: count(input.note50Count, "note50Count"),
        note20Count: count(input.note20Count, "note20Count"),
        note10Count: count(input.note10Count, "note10Count"),
        coinsInr: coinAmount(input.coinsInr),
      };
      return endShiftAndHandover(tx, actor, branchId, id, denominations);
    });
    return json(result, 201);
  });
}
