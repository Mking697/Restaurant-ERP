import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertUserAdmin, branchScope, safeUser } from "@/lib/server/permissions";
import { userInput } from "@/lib/server/users";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request); assertUserAdmin(actor); const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
  const rows = await db.select().from(users).where(scope ? eq(users.branchId, scope) : undefined).orderBy(users.name);
  return json({ users: rows.map(safeUser) });
}); }
export async function POST(request: Request) { return api(async () => {
  const user = await mutate(request, async (tx, actor) => { assertUserAdmin(actor); const input = await userInput(tx, actor, await body(request)); const [row] = await tx.insert(users).values({ id: randomUUID(), ...input, createdBy: actor.id }).returning(); return safeUser(row); });
  return json({ user }, 201);
}); }
