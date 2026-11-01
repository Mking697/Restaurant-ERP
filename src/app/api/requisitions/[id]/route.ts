import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { getRequisition } from "@/lib/server/requisitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const actor = await requireIdentity(request);
    const requisition = await getRequisition(db, actor, id);
    return json({ requisition });
  });
}
