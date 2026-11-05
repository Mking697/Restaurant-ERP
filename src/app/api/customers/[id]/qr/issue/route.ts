import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { issueMemberQrToken } from "@/lib/server/customer-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-040: returns the RAW token exactly once — never retrievable again
// after this response. Branch Manager (own-registered member)/Owner only,
// enforced inside issueMemberQrToken itself.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const issued = await mutate(request, async (tx, actor) => issueMemberQrToken(tx, actor, id));
    return json({ issued }, 201);
  });
}
