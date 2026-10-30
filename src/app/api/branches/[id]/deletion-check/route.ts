import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { checkBranchDeletion } from "@/lib/server/branch-deletion";
import { api, json } from "@/lib/server/http";
import { assertOwner, HttpError } from "@/lib/server/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertOwner(actor);
    if (new URL(request.url).searchParams.size) throw new HttpError(400, "Deletion check does not accept query parameters");
    const { id } = await context.params;
    return json(await checkBranchDeletion(db, actor, id));
  });
}
