import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stockCounts } from "@/db/schema/stock-count";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { loadCount, startStockCount } from "@/lib/server/stock-count";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Redact the system's own expected-qty snapshot while a count is still
// DRAFT — a blind count (the counter must not see what the system expects
// before they submit their own physical number).
function redact<T extends { status: string; lines: { expectedQty: string }[] }>(count: T) {
  if (count.status !== "DRAFT") return count;
  return { ...count, lines: count.lines.map((line) => ({ ...line, expectedQty: null })) };
}

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "INVENTORY");
    const url = new URL(request.url);
    const scope = branchScope(actor, url.searchParams.get("branchId"));
    const rows = await db
      .select({ id: stockCounts.id, branchId: stockCounts.branchId, status: stockCounts.status, startedAt: stockCounts.startedAt, submittedAt: stockCounts.submittedAt, approvedAt: stockCounts.approvedAt })
      .from(stockCounts)
      .where(scope ? eq(stockCounts.branchId, scope) : undefined)
      .orderBy(desc(stockCounts.startedAt))
      .limit(200);
    return json({ stockCounts: rows });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "INVENTORY");
      const input = await body(request);
      if (Object.keys(input).some((key) => !["branchId", "rawMaterialIds"].includes(key))) throw new HttpError(400, "Unexpected field");
      const branchId = branchScope(actor, input.branchId as string | undefined) ?? (input.branchId as string);
      if (!branchId) throw new HttpError(400, "branchId is required");
      return startStockCount(tx, actor, branchId, input.rawMaterialIds as string[]);
    });
    return json({ stockCount: redact(result) }, 201);
  });
}
