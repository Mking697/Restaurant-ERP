import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branches } from "@/db/schema/platform";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { branchInput } from "@/lib/server/branches";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, branchScope } from "@/lib/server/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request); const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
  return json({ branches: await db.select().from(branches).where(scope ? eq(branches.id, scope) : undefined).orderBy(branches.code) });
}); }
export async function POST(request: Request) { return api(async () => {
  const result = await mutate(request, async (tx, actor) => { assertOwner(actor); const input = branchInput(await body(request)); const [row] = await tx.insert(branches).values({ id: randomUUID(), ...input }).returning(); return row; });
  return json({ branch: result }, 201);
}); }
