import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { indents, indentLines } from "@/db/schema/purchase";
import { rawMaterials } from "@/db/schema/menu";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only purchasing choices: PURCHASE_ORDER does not grant draft reads or
// indent approval. POST revalidates status and exact quantities under mutate().
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_ORDER");
    const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const rows = await db.select({ id: indents.id, branchId: indents.branchId })
      .from(indents)
      .where(and(eq(indents.status, "APPROVED"), scope ? eq(indents.branchId, scope) : undefined))
      .orderBy(desc(indents.createdAt)).limit(200);
    if (!rows.length) return json({ indents: [] });
    const lines = await db.select({ indentId: indentLines.indentId, rawMaterialId: indentLines.rawMaterialId, qty: indentLines.qty, name: rawMaterials.name, unit: rawMaterials.unit })
      .from(indentLines).innerJoin(rawMaterials, eq(rawMaterials.id, indentLines.rawMaterialId))
      .where(inArray(indentLines.indentId, rows.map((r) => r.id)));
    return json({ indents: rows.map((row) => ({ ...row, lines: lines.filter((line) => line.indentId === row.id).map(({ indentId: _indentId, ...line }) => line) })) });
  });
}
