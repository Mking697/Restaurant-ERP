import { api, body, json, string } from "@/lib/server/http";
import { mutate } from "@/lib/server/auth";
import { settleVendorReturn } from "@/lib/server/vendor-returns";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// POST /api/purchase/material-returns/[id]/settle — "Mark as Settled"
// (ACCOUNTS_EXPENSES-gated, once-only). See settleVendorReturn for the
// write invariant; VENDOR_REFUNDS itself stays read-only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => json(await mutate(request, async (tx, actor) => settleVendorReturn(tx, actor, string((await params).id, "claim ID"), await body(request)))));
}
