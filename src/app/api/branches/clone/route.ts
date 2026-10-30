import { cloneBranch } from "@/lib/server/branch-clone";
import { mutate } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return api(async () => {
  const result = await mutate(request, async (tx, actor) => cloneBranch(tx, actor, await body(request)));
  return json(result, 201);
}); }
