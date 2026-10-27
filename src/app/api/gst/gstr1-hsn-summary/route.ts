import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { posOrderLines, posOrders } from "@/db/schema/pos";
import { menuItems } from "@/db/schema/menu";
import { branches } from "@/db/schema/platform";
import { settings } from "@/db/schema/settings";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { hsnSummary, type GstrLineInput } from "@/lib/server/gstr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GSTR-1 HSN Summary (Table 12) export — real COMPLETED orders only
// (VOIDED excluded), grouped by HSN/SAC + rate, for the requested date
// range and branch scope. Orders from a branch with no gst_state_code
// configured (or before the company-wide GST_HOME_STATE_CODE setting
// existed) are EXCLUDED and their count reported separately — a GSTR
// filing must never silently include tax-free/mis-configured sales as if
// they were GST-compliant.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const url = new URL(request.url);
    const branchId = branchScope(actor, url.searchParams.get("branchId"));
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new HttpError(400, "from/to must be YYYY-MM-DD");
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) throw new HttpError(400, "from/to is not a valid calendar date");
    if (fromDate > toDate) throw new HttpError(400, "from must be before to");

    const [companyStateRow] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "GST_HOME_STATE_CODE")).limit(1);
    const companyStateCode = companyStateRow?.value ?? "";

    const orders = await db
      .select({ id: posOrders.id, branchId: posOrders.branchId })
      .from(posOrders)
      .where(and(branchId ? eq(posOrders.branchId, branchId) : undefined, ne(posOrders.status, "VOIDED"), gte(posOrders.createdAt, fromDate), lte(posOrders.createdAt, toDate)));
    if (!orders.length) return json({ rows: [], grandTaxableValue: "0.00", grandTotalTax: "0.00", grandTotalValue: "0.00", ordersIncluded: 0, ordersExcludedNoGst: 0 });

    const branchIds = [...new Set(orders.map((o) => o.branchId))];
    const branchRows = await db.select({ id: branches.id, gstStateCode: branches.gstStateCode }).from(branches).where(inArray(branches.id, branchIds));
    const branchStateById = new Map(branchRows.map((b) => [b.id, b.gstStateCode]));

    const gstConfiguredOrders = orders.filter((o) => !!branchStateById.get(o.branchId) && !!companyStateCode);
    const ordersExcludedNoGst = orders.length - gstConfiguredOrders.length;
    if (!gstConfiguredOrders.length) return json({ rows: [], grandTaxableValue: "0.00", grandTotalTax: "0.00", grandTotalValue: "0.00", ordersIncluded: 0, ordersExcludedNoGst });

    const orderIds = gstConfiguredOrders.map((o) => o.id);
    const lineRows = await db
      .select({ orderId: posOrderLines.orderId, qty: posOrderLines.qty, price: posOrderLines.price, menuItemId: posOrderLines.menuItemId })
      .from(posOrderLines)
      .where(inArray(posOrderLines.orderId, orderIds));
    const menuItemIds = [...new Set(lineRows.map((l) => l.menuItemId))];
    const itemRows = menuItemIds.length ? await db.select({ id: menuItems.id, hsnSacCode: menuItems.hsnSacCode, gstRatePercent: menuItems.gstRatePercent }).from(menuItems).where(inArray(menuItems.id, menuItemIds)) : [];
    const itemById = new Map(itemRows.map((i) => [i.id, i]));
    const branchByOrderId = new Map(gstConfiguredOrders.map((o) => [o.id, o.branchId]));

    const inputs: GstrLineInput[] = lineRows.map((line) => {
      const item = itemById.get(line.menuItemId);
      const branchIdForLine = branchByOrderId.get(line.orderId)!;
      return {
        hsnSacCode: item?.hsnSacCode ?? "",
        ratePercent: item?.gstRatePercent ?? "0.00",
        qty: line.qty,
        lineTotalDecimal: (Number(line.price) * line.qty).toFixed(2),
        branchStateCode: branchStateById.get(branchIdForLine) ?? "",
        companyStateCode,
      };
    });

    const summary = hsnSummary(inputs);
    return json({ ...summary, ordersIncluded: gstConfiguredOrders.length, ordersExcludedNoGst });
  });
}
