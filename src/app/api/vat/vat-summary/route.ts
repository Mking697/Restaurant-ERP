import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { posOrderLines, posOrders } from "@/db/schema/pos";
import { menuItems } from "@/db/schema/menu";
import { branches } from "@/db/schema/platform";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { vatSummary, type VatSummaryLineInput } from "@/lib/server/vat-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// VAT Summary export — real COMPLETED orders only (VOIDED excluded),
// grouped by productCode + rate, for the requested date range and branch
// scope. Tanzania has no GSTR-1/HSN statutory filing format to replicate —
// this is a plain accounting summary (taxable value + VAT amount by rate),
// the local replacement for the old GSTR-1 HSN Summary export.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    // Official export always includes every eligible sale, including Owner-only
    // operational orders. POS access alone must not expose this unfiltered view.
    assertModule(actor, "OFFICIAL_SALES_REPORTS");
    const url = new URL(request.url);
    const branchId = branchScope(actor, url.searchParams.get("branchId"));
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new HttpError(400, "from/to must be YYYY-MM-DD");
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) throw new HttpError(400, "from/to is not a valid calendar date");
    if (fromDate > toDate) throw new HttpError(400, "from must be before to");

    const orders = await db
      .select({ id: posOrders.id, branchId: posOrders.branchId })
      .from(posOrders)
      .where(and(branchId ? eq(posOrders.branchId, branchId) : undefined, ne(posOrders.status, "VOIDED"), gte(posOrders.createdAt, fromDate), lte(posOrders.createdAt, toDate)));
    if (!orders.length) return json({ rows: [], grandTaxableValue: "0.00", grandTotalTax: "0.00", grandTotalValue: "0.00", ordersIncluded: 0 });

    const branchIds = [...new Set(orders.map((o) => o.branchId))];
    const branchRows = await db.select({ id: branches.id, vatRatePercent: branches.vatRatePercent }).from(branches).where(inArray(branches.id, branchIds));
    const branchVatOverrideById = new Map(branchRows.map((b) => [b.id, b.vatRatePercent]));

    const orderIds = orders.map((o) => o.id);
    const lineRows = await db
      .select({ orderId: posOrderLines.orderId, qty: posOrderLines.qty, price: posOrderLines.price, menuItemId: posOrderLines.menuItemId })
      .from(posOrderLines)
      .where(inArray(posOrderLines.orderId, orderIds));
    const menuItemIds = [...new Set(lineRows.map((l) => l.menuItemId))];
    const itemRows = menuItemIds.length ? await db.select({ id: menuItems.id, productCode: menuItems.productCode, vatRatePercent: menuItems.vatRatePercent }).from(menuItems).where(inArray(menuItems.id, menuItemIds)) : [];
    const itemById = new Map(itemRows.map((i) => [i.id, i]));
    const branchByOrderId = new Map(orders.map((o) => [o.id, o.branchId]));

    const inputs: VatSummaryLineInput[] = lineRows.map((line) => {
      const item = itemById.get(line.menuItemId);
      const branchIdForLine = branchByOrderId.get(line.orderId)!;
      const branchOverride = branchVatOverrideById.get(branchIdForLine) ?? null;
      return {
        productCode: item?.productCode ?? "",
        ratePercent: branchOverride ?? item?.vatRatePercent ?? "0.00",
        qty: line.qty,
        lineTotalDecimal: (Number(line.price) * line.qty).toFixed(2),
      };
    });

    const summary = vatSummary(inputs);
    return json({ ...summary, ordersIncluded: orders.length });
  });
}
