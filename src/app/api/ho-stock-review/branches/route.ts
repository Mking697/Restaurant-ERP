import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branches } from "@/db/schema/platform";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertHoReviewAccess } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertHoReviewAccess(actor);
    const rows = await db.select().from(branches).where(actor.role === "BRANCH_MANAGER" && actor.branchId ? eq(branches.id, actor.branchId) : undefined).orderBy(branches.code);
    return json({ branches: rows });
  });
}
