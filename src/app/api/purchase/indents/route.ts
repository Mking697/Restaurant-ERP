import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { indents, indentLines } from "@/db/schema/purchase";
import { branches } from "@/db/schema/platform";
import { users } from "@/db/schema/auth";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { allowedFields, INDENT_STATUSES, parseIndentLines, parseStatusFilter } from "@/lib/server/purchase";
import { ensureBranch, ensureRawMaterial } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/purchase/indents?branchId=&status= — branch-scoped list for the
// Indents tab. Line count is a cheap aggregate, not a full line dump (the UI
// only needs a count per the mock-data shape it previously rendered).
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "PURCHASE_INDENT");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, query.get("branchId"));
    const status = parseStatusFilter(query.get("status"), INDENT_STATUSES);

    const rows = await db
      .select({
        id: indents.id,
        branchId: indents.branchId,
        branch: branches.name,
        raisedById: indents.raisedById,
        raisedBy: users.name,
        status: indents.status,
        spikePercent: indents.spikePercent,
        dailyAvgQtyJson: indents.dailyAvgQtyJson,
        approvedById: indents.approvedById,
        createdAt: indents.createdAt,
      })
      .from(indents)
      .innerJoin(branches, eq(branches.id, indents.branchId))
      .innerJoin(users, eq(users.id, indents.raisedById))
      .where(and(scope ? eq(indents.branchId, scope) : undefined, status ? eq(indents.status, status) : undefined))
      .orderBy(desc(indents.createdAt))
      .limit(200);

    if (!rows.length) return json({ indents: [] });
    const lineCounts = await db
      .select({ indentId: indentLines.indentId, count: sql<number>`count(*)::int` })
      .from(indentLines)
      .where(inArray(indentLines.indentId, rows.map((r) => r.id)))
      .groupBy(indentLines.indentId);
    const countMap = new Map(lineCounts.map((l) => [l.indentId, l.count]));
    return json({ indents: rows.map((r) => ({ ...r, lineCount: countMap.get(r.id) ?? 0 })) });
  });
}

// POST /api/purchase/indents — create a DRAFT indent with 1-50 lines.
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "PURCHASE_INDENT");
      const input = await body(request);
      allowedFields(input, ["branchId", "lines"]);
      const branchId = branchScope(actor, string(input.branchId, "branchId"));
      if (!branchId) throw new HttpError(400, "Select a branch");
      await ensureBranch(tx, branchId);
      const lines = parseIndentLines(input.lines);
      for (const line of lines) await ensureRawMaterial(tx, line.rawMaterialId);

      const id = randomUUID();
      await tx.insert(indents).values({ id, branchId, raisedById: actor.id, status: "DRAFT" });
      await tx.insert(indentLines).values(lines.map((l) => ({ id: randomUUID(), indentId: id, rawMaterialId: l.rawMaterialId, qty: l.qty })));
      const [row] = await tx.select().from(indents).where(eq(indents.id, id));
      return { indent: row, lines };
    });
    return json(result, 201);
  });
}
