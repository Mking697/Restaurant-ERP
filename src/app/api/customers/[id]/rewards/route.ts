import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { rewardEvents } from "@/db/schema/rewards";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { getRewardBalance } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const { id } = await params;
    const [balance, history] = await Promise.all([
      getRewardBalance(db, id),
      db.select().from(rewardEvents).where(eq(rewardEvents.customerId, id)).orderBy(desc(rewardEvents.createdAt)).limit(200),
    ]);
    return json({ balance, history });
  });
}
