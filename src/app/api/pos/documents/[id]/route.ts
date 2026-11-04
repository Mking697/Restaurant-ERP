import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { readPosDocument } from "@/lib/server/pos-documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    return json(await locked(async tx => readPosDocument(tx, await requireIdentity(request, tx), id)));
  });
}
