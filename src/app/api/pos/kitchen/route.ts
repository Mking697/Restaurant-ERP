import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { listPosKitchen } from "@/lib/server/pos-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const result = await locked(async tx => listPosKitchen(tx, await requireIdentity(request, tx), { branchId: query.get("branchId") ?? undefined, station: query.get("station") ?? undefined, includeServed: query.get("includeServed") ?? undefined }));
    return json(result);
  });
}
