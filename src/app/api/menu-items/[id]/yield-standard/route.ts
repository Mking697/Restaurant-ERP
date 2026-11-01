import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { currentYieldStandard, setYieldStandard } from "@/lib/server/yield-standards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-011. Owner-only to set (assertOwner is enforced inside
// setYieldStandard itself — never only at the route layer); any
// MENU_BOM-authorized reader can see the current band.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const actor = await requireIdentity(_request);
    assertModule(actor, "MENU_BOM");
    const standard = await currentYieldStandard(db, id);
    return json({ standard });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const standard = await mutate(request, async (tx, actor) => {
      const input = await body(request);
      return setYieldStandard(tx, actor, id, input);
    });
    return json({ standard }, 201);
  });
}
