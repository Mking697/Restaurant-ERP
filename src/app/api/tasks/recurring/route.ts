import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { createRecurring, listRecurring } from "@/lib/server/tasks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request);
  return json(await listRecurring(db, actor, new URL(request.url).searchParams.get("branchId")));
}); }
export async function POST(request: Request) { return api(async () => {
  const result = await mutate(request, async (tx, actor) => createRecurring(tx, actor, await body(request)));
  return json(result, 201);
}); }
