import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule } from "@/lib/server/permissions";
import { getCustomerWithConsent, updateCustomerName } from "@/lib/server/customers";
import { db } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const { id } = await params;
    const customer = await getCustomerWithConsent(db, id);
    return json({ customer });
  });
}

// Name only — phone is the identity key and is never changed via a simple
// edit (see src/lib/server/customers.ts). Branch Manager/Owner only,
// enforced inside updateCustomerName itself.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const customer = await mutate(request, async (tx, actor) => updateCustomerName(tx, actor, id, (await body(request)).name));
    return json({ customer });
  });
}
