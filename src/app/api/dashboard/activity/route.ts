import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope } from "@/lib/server/permissions";
import { getRecentActivity } from "@/lib/server/recent-activity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "DASHBOARD_OWNER");
    const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const events = await getRecentActivity(scope, 7);
    return json({ events });
  });
}
