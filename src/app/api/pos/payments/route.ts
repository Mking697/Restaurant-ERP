import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { listPosPayments } from "@/lib/server/pos-payments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    return json(await locked(async tx => listPosPayments(tx, await requireIdentity(request, tx), { branchId: query.get("branchId") ?? undefined, orderId: query.get("orderId") ?? undefined })));
  });
}
