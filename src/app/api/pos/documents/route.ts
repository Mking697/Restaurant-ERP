import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { listPosDocuments } from "@/lib/server/pos-documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    return json(await locked(async tx => listPosDocuments(tx, await requireIdentity(request, tx), { branchId: query.get("branchId") ?? undefined, sourceType: query.get("sourceType") ?? undefined, sourceId: query.get("sourceId") ?? undefined })));
  });
}
