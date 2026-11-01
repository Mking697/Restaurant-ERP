import { db } from "@/db/client";
import { stockCounts } from "@/db/schema/stock-count";
import { eq } from "drizzle-orm";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { loadCount } from "@/lib/server/stock-count";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redact<T extends { status: string; lines: { expectedQty: string }[] }>(count: T) {
  if (count.status !== "DRAFT") return count;
  return { ...count, lines: count.lines.map((line) => ({ ...line, expectedQty: null })) };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "INVENTORY");
    const { id } = await params;
    const [header] = await db.select({ branchId: stockCounts.branchId }).from(stockCounts).where(eq(stockCounts.id, id)).limit(1);
    if (!header) throw new HttpError(404, "Stock count not found");
    branchScope(actor, header.branchId);
    const count = await loadCount(db, id);
    return json({ stockCount: redact(count) });
  });
}
