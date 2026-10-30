import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { historicalQuery, readApprovedIndent } from "@/lib/server/historical-purchase-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const actor = await requireIdentity(request);
    const query = historicalQuery(request, (await context.params).id);
    return json({ indent: await readApprovedIndent(db, actor, query.id, query.branchId) });
  });
}
