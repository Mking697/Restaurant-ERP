import { db } from "@/db/client";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { listInstances } from "@/lib/server/tasks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request);
  const q = new URL(request.url).searchParams;
  return json(await listInstances(db, actor, q.get("branchId"), q.get("type"), q.get("status")));
}); }
