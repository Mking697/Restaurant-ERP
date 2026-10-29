import { eq } from "drizzle-orm";
import { indents } from "@/db/schema/purchase";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { allowedFields, assertIndentPending } from "@/lib/server/purchase";
import { loadIndent } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/purchase/indents/[id]/reject — same grant/branch rule as approve.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_INDENT");
      allowedFields(await body(request), []);
      const { id } = await context.params;
      const indent = await loadIndent(tx, id);
      branchScope(actor, indent.branchId);
      assertIndentPending(indent.status);
      await tx.update(indents).set({ status: "REJECTED", approvedById: actor.id }).where(eq(indents.id, id));
      const [row] = await tx.select().from(indents).where(eq(indents.id, id));
      return { indent: row };
    });
    return json(result);
  });
}
