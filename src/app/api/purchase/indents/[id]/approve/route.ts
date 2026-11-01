import { eq } from "drizzle-orm";
import { indents } from "@/db/schema/purchase";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, branchScope } from "@/lib/server/permissions";
import { allowedFields, assertIndentPending } from "@/lib/server/purchase";
import { loadIndent } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/indents/[id]/approve — GAP-016: Owner-only. A
// PENDING_APPROVAL indent only ever exists because the Owner's own
// mandatory HO-approval policy (quantity spike or value threshold,
// src/lib/server/business-policy.ts) forced it there — the free,
// no-review path already auto-approves below-threshold indents. So every
// indent reaching this endpoint is, by construction, a mandatory HO
// decision, and self/unauthorized approval by the branch actor who raised
// it is no longer possible (Owner is a distinct role from every branch
// requester).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertOwner(actor);
      allowedFields(await body(request), []);
      const { id } = await context.params;
      const indent = await loadIndent(tx, id);
      branchScope(actor, indent.branchId);
      assertIndentPending(indent.status);
      await tx.update(indents).set({ status: "APPROVED", approvedById: actor.id }).where(eq(indents.id, id));
      const [row] = await tx.select().from(indents).where(eq(indents.id, id));
      return { indent: row };
    });
    return json(result);
  });
}
