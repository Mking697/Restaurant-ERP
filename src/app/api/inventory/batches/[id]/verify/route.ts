import { and, eq } from "drizzle-orm";
import { stockBatches } from "@/db/schema/inventory";
import { batchMovement } from "@/lib/server/stock-batches";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, HttpError } from "@/lib/server/permissions";
import { calendarDate, fields, text } from "@/lib/server/batch-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/inventory/batches/[id]/verify — Owner-only. Resolves an
// UNKNOWN-expiry batch to either a real known expiryDate OR an explicitly
// verified NON_EXPIRING disposition, with mandatory auditable evidence.
// Never silently changes an ALREADY-dated batch's expiry (that would let
// someone rewrite history) — this is a one-shot release of a batch that
// started life UNKNOWN (held), not a correction mechanism for a mistaken
// real date.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await mutate(request, async (tx, actor) => {
      assertOwner(actor);
      const input = await body(request);
      fields(input, ["expiryDate", "nonExpiring", "evidence"]);
      const expiryDate = calendarDate(input.expiryDate);
      const nonExpiring = input.nonExpiring === true;
      if (expiryDate && nonExpiring) throw new HttpError(400, "Choose expiryDate or nonExpiring, not both");
      if (!expiryDate && !nonExpiring) throw new HttpError(400, "Supply a real expiryDate or explicit nonExpiring");
      const evidence = text(input.evidence, "evidence", 2000);
      if (evidence.length < 3) throw new HttpError(400, "Auditable evidence is required");

      const [batch] = await tx.select().from(stockBatches).where(eq(stockBatches.id, id)).limit(1).for("update");
      if (!batch) throw new HttpError(404, "Batch not found");
      if (batch.expiryStatus !== "UNKNOWN") throw new HttpError(409, "Batch already has a known disposition; verification only releases UNKNOWN batches");

      const expiryStatus = expiryDate ? "DATED" : "NON_EXPIRING";
      await tx.update(stockBatches).set({ expiryDate, expiryStatus }).where(and(eq(stockBatches.id, id), eq(stockBatches.expiryStatus, "UNKNOWN")));
      await batchMovement(tx, id, 0n, { actorId: actor.id, sourceType: "BATCH_VERIFY", sourceId: id, evidence }, { expiryDate, expiryStatus });
      const [updated] = await tx.select().from(stockBatches).where(eq(stockBatches.id, id));
      return updated;
    });
    return json({ batch: result }, 200);
  });
}
