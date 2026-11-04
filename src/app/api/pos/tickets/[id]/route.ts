import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { readPosTicket } from "@/lib/server/pos-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const result = await locked(async tx => readPosTicket(tx, await requireIdentity(request, tx), id));
    return json(result);
  });
}
