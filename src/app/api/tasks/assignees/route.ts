import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/permissions";
import { listAssignees } from "@/lib/server/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== "branchId") || params.getAll("branchId").length !== 1) {
    throw new HttpError(400, "Exactly one branchId query parameter is required");
  }
  return json(await listAssignees(db, actor, params.get("branchId")));
}); }
