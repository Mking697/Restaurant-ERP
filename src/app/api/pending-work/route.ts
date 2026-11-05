import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { getPendingWorkForActor } from "@/lib/server/pending-work";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    const items = await getPendingWorkForActor(actor);
    return json({ items });
  });
}
