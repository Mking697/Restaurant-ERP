import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branches } from "@/db/schema/platform";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { branchInput, branchLogoInput } from "@/lib/server/branches";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, branchScope } from "@/lib/server/permissions";
import { brandLogoUrl } from "@/lib/server/branches-branding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => {
  const actor = await requireIdentity(request); const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
  const rows = await db.select().from(branches).where(scope ? eq(branches.id, scope) : undefined).orderBy(branches.code);
  return json({ branches: rows.map(({ brandLogo, ...rest }) => ({ ...rest, brandLogoUrl: brandLogoUrl(rest.id, brandLogo) })) });
}); }
export async function POST(request: Request) { return api(async () => {
  const payload = await body(request, 1450000);
  const input = branchInput(payload); const brandLogo = await branchLogoInput(payload.logo);
  const result = await mutate(request, async (tx, actor) => { assertOwner(actor); const [row] = await tx.insert(branches).values({ id: randomUUID(), ...input, ...(brandLogo === undefined ? {} : { brandLogo }) }).returning(); return row; });
  return json({ branch: result }, 201);
}); }
