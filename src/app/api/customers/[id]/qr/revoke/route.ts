import { mutate } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { revokeMemberQrToken } from "@/lib/server/customer-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const token = await mutate(request, async (tx, actor) => revokeMemberQrToken(tx, actor, id));
    return json({ token });
  });
}
