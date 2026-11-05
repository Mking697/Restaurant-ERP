import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { findOrCreateCustomer, searchCustomers } from "@/lib/server/customers";
import { db } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-038: global search — any POS_CASHIER-module staff may find ANY
// ACTIVE member regardless of which branch registered them.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const customers = await searchCustomers(db, query);
    return json({ customers });
  });
}

// Idempotent find-or-create by phone — registering an already-known phone
// never creates a duplicate identity, it just returns the existing one.
export async function POST(request: Request) {
  return api(() => mutate(request, async (tx, actor) => {
    assertModule(actor, "POS_CASHIER");
    const input = await body(request);
    const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
    if (!branchId) throw new HttpError(400, "Select a branch");
    const { customer, created } = await findOrCreateCustomer(tx, actor, branchId, { phone: input.phone, name: input.name });
    return json({ customer, created }, created ? 201 : 200);
  }));
}
