import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { menuItems } from "@/db/schema/menu";
import { posOrderLines, posOrders } from "@/db/schema/pos";
import { branches } from "@/db/schema/platform";
import { settings } from "@/db/schema/settings";
import { currencyRates } from "@/db/schema/currency";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";
import { deductStock, lockRecipeStock, readStockRecipe } from "@/lib/server/production";
import { directRequirements } from "@/lib/server/production-quantity";
import { gstInvoiceSummary } from "@/lib/server/gst";
import { thankYouMessage, validOptionalPhone } from "@/lib/server/whatsapp-triggers";
import { sendWhatsAppMessage } from "@/lib/chatxflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = ["DINE_IN", "TAKEAWAY", "SWIGGY", "ZOMATO"] as const;
const TENDERS = ["CASH", "UPI", "CARD", "SWIGGY", "ZOMATO"] as const;
const POS_COUNTERS = ["COUNTER_1", "COUNTER_2"] as const;

// Today's orders for the actor's branch scope (cashier's own branch, Owner
// can pass ?branchId= or omit for all). Line items are summarized as a
// comma-joined label so the POS table stays one row per order.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "POS_CASHIER");
    const scope = branchScope(actor, new URL(request.url).searchParams.get("branchId"));
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const orders = await db
      .select({ id: posOrders.id, branchId: posOrders.branchId, orderNumber: posOrders.orderNumber, channel: posOrders.channel, tableNo: posOrders.tableNo, counterNo: posOrders.counterNo, totalAmount: posOrders.totalAmount, tenderType: posOrders.tenderType, tenderCurrencyCode: posOrders.tenderCurrencyCode, tenderCurrencyAmount: posOrders.tenderCurrencyAmount, status: posOrders.status, createdAt: posOrders.createdAt })
      .from(posOrders)
      .where(and(scope ? eq(posOrders.branchId, scope) : undefined, gte(posOrders.createdAt, startOfDay)))
      .orderBy(desc(posOrders.createdAt))
      .limit(200);
    return json({ orders });
  });
}


// Order-confirm: explodes every line's dish (recursively through any Semi-FG)
// down to raw-material requirements, merges them across the whole order, then
// atomically checks and deducts branch inventory_stock before the order is
// allowed to post. No partial deduction — if ANY required raw material is
// short, the whole order is rejected (409) with the shortfall list, same as
// a real kitchen would refuse to fire a ticket it can't fulfil.
//
// Returns two views per the planned process-flow split: `kot` (dish name +
// qty, no price — what the kitchen prints) and `receipt` (price + GST
// breakdown + total — what the customer gets). GST is computed per-line from
// each menu item's gstRatePercent and split CGST+SGST/IGST per
// src/lib/server/gst.ts — but only when both the branch and company GST
// state codes are configured; otherwise the order still posts tax-free
// rather than blocking billing. WhatsApp Thank You and multi-currency are
// NOT part of this endpoint yet — explicitly out of scope for this pass.
export async function POST(request: Request) {
  return api(async () => {
    const result = await mutate(request, async (tx, actor) => {
      assertModule(actor, "POS_CASHIER");
      const input = await body(request);
      const branchId = branchScope(actor, typeof input.branchId === "string" ? input.branchId : undefined);
      if (!branchId) throw new HttpError(400, "Select a branch");
      if (!(CHANNELS as readonly string[]).includes(input.channel as string)) throw new HttpError(400, "Invalid channel");
      if (!(TENDERS as readonly string[]).includes(input.tenderType as string)) throw new HttpError(400, "Invalid tenderType");
      const tableNo = typeof input.tableNo === "string" ? input.tableNo.slice(0, 40) : "";
      const counterNo = typeof input.counterNo === "string" && (POS_COUNTERS as readonly string[]).includes(input.counterNo) ? (input.counterNo as (typeof POS_COUNTERS)[number]) : "COUNTER_1";
      const customerPhone = validOptionalPhone(input.customerPhone);
      const customerName = typeof input.customerName === "string" ? input.customerName.slice(0, 80) : "";
      // Multi-currency — optional. Default INR needs no lookup. A foreign
      // tenderCurrencyCode must have a configured rate (Owner-set via
      // /api/currency-rates) or the order is rejected rather than silently
      // assuming a 1:1 rate — see src/db/schema/currency.ts.
      const tenderCurrencyCode = typeof input.tenderCurrencyCode === "string" && input.tenderCurrencyCode ? input.tenderCurrencyCode.toUpperCase() : "INR";
      let fxRateToInr = 1;
      if (tenderCurrencyCode !== "INR") {
        const [rateRow] = await tx.select({ rateToInr: currencyRates.rateToInr }).from(currencyRates).where(eq(currencyRates.currencyCode, tenderCurrencyCode)).limit(1);
        if (!rateRow) throw new HttpError(400, `No exchange rate configured for ${tenderCurrencyCode} — ask the Owner to set one first.`);
        fxRateToInr = Number(rateRow.rateToInr);
      }
      const rawLines = input.lines;
      if (!Array.isArray(rawLines) || !rawLines.length || rawLines.length > 50) throw new HttpError(400, "1-50 order lines required");
      const lines = rawLines.map((line) => {
        if (!line || typeof line !== "object") throw new HttpError(400, "Invalid order line");
        const { menuItemId, qty } = line as Record<string, unknown>;
        if (typeof menuItemId !== "string" || !menuItemId) throw new HttpError(400, "Invalid menuItemId");
        if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 500) throw new HttpError(400, "Invalid qty (1-500)");
        return { menuItemId, qty };
      });
      await lockRecipeStock(tx, branchId);
      const menuItemIds = [...new Set(lines.map((l) => l.menuItemId))];
      const items = await tx
        .select({ id: menuItems.id, branchId: menuItems.branchId, name: menuItems.name, price: menuItems.price, isActive: menuItems.isActive, isSellable: menuItems.isSellable, gstRatePercent: menuItems.gstRatePercent, hsnSacCode: menuItems.hsnSacCode })
        .from(menuItems)
        .where(inArray(menuItems.id, menuItemIds));
      const itemById = new Map(items.map((item) => [item.id, item]));
      for (const id of menuItemIds) {
        const item = itemById.get(id);
        if (!item) throw new HttpError(400, `Menu item ${id} not found`);
        if (item.branchId !== branchId) throw new HttpError(400, `Menu item ${id} is not in this branch`);
        if (!item.isActive) throw new HttpError(400, `Menu item ${item.name} is inactive`);
        if (!item.isSellable) throw new HttpError(400, `${item.name} is a Semi-FG base and cannot be ordered directly`);
      }

      const recipeRows = await readStockRecipe(tx, branchId, menuItemIds);
      const required = directRequirements(branchId, recipeRows, lines.map(line => ({ menuItemId: line.menuItemId, quantity: String(line.qty) })));
      const deductions = await deductStock(tx, branchId, required);

      const subtotal = lines.reduce((sum, line) => sum + Number(itemById.get(line.menuItemId)!.price) * line.qty, 0);

      // GST — optional per order. If either this branch's gst_state_code or
      // the company-wide GST_HOME_STATE_CODE setting isn't configured yet,
      // the order still posts (tax-free) rather than blocking billing for a
      // branch that hasn't been GST-onboarded — see src/lib/server/gst.ts.
      const [branchRow] = await tx.select({ gstStateCode: branches.gstStateCode, name: branches.name }).from(branches).where(eq(branches.id, branchId)).limit(1);
      const [companyStateRow] = await tx.select({ value: settings.value }).from(settings).where(eq(settings.key, "GST_HOME_STATE_CODE")).limit(1);
      const companyStateCode = companyStateRow?.value ?? "";
      const gstConfigured = !!branchRow?.gstStateCode && !!companyStateCode;
      const gstSummary = gstConfigured
        ? gstInvoiceSummary(
            lines.map((line) => {
              const item = itemById.get(line.menuItemId)!;
              return { taxableAmountDecimal: (Number(item.price) * line.qty).toFixed(2), ratePercent: item.gstRatePercent };
            }),
            branchRow!.gstStateCode,
            companyStateCode
          )
        : null;
      const taxAmount = gstSummary ? gstSummary.grandTotalTax : "0.00";
      const totalAmount = gstSummary ? gstSummary.grandTotal : subtotal.toFixed(2);
      // tenderCurrencyAmount is a payment-convenience conversion, NOT the
      // GST invoice amount (that's always totalAmount, in INR) — rounding
      // here uses plain decimal math, same spirit as the BOM costing
      // estimate (src/lib/server/bom.ts), deliberately different from the
      // paise-exact BigInt math src/lib/server/gst.ts uses for tax.
      const tenderCurrencyAmount = tenderCurrencyCode === "INR" ? totalAmount : (Number(totalAmount) / fxRateToInr).toFixed(2);

      const orderId = randomUUID();
      const orderNumber = `ORD-${Date.now()}-${orderId.slice(0, 4)}`;
      await tx.insert(posOrders).values({
        id: orderId,
        branchId,
        orderNumber,
        channel: input.channel as (typeof CHANNELS)[number],
        tableNo,
        counterNo,
        customerPhone,
        customerName,
        subtotal: subtotal.toFixed(2),
        taxAmount,
        totalAmount,
        tenderCurrencyCode,
        fxRateToInr: fxRateToInr.toFixed(6),
        tenderCurrencyAmount,
        tenderType: input.tenderType as string,
        cashierId: actor.id,
      });
      await tx.insert(posOrderLines).values(
        lines.map((line) => ({ id: randomUUID(), orderId, menuItemId: line.menuItemId, qty: line.qty, price: itemById.get(line.menuItemId)!.price }))
      );

      const kot = lines.map((line) => ({ menuItemId: line.menuItemId, name: itemById.get(line.menuItemId)!.name, qty: line.qty }));
      const receipt = {
        lines: lines.map((line) => ({ menuItemId: line.menuItemId, name: itemById.get(line.menuItemId)!.name, qty: line.qty, price: itemById.get(line.menuItemId)!.price, lineTotal: (Number(itemById.get(line.menuItemId)!.price) * line.qty).toFixed(2), hsnSacCode: itemById.get(line.menuItemId)!.hsnSacCode, gstRatePercent: itemById.get(line.menuItemId)!.gstRatePercent })),
        subtotal: subtotal.toFixed(2),
        taxAmount,
        totalAmount,
        gst: gstSummary ? { configured: true, ...gstSummary } : { configured: false, note: "GST not configured for this branch/company yet — billed tax-free." },
        currency: tenderCurrencyCode === "INR" ? null : { tenderCurrencyCode, fxRateToInr: fxRateToInr.toFixed(6), tenderCurrencyAmount },
      };
      // Preserve existing numeric POS output; internal stock math stays exact.
      const inventoryDeducted = deductions.inventoryDeducted.map(row => ({ ...row, qtyDeducted: Number(row.qtyDeducted) }));
      const semiFgDeducted = deductions.semiFgDeducted.map(row => ({ ...row, qtyDeducted: Number(row.qtyDeducted) }));

      return { order: { id: orderId, orderNumber, branchId, branchName: branchRow?.name ?? "", channel: input.channel, tableNo, counterNo, tenderType: input.tenderType, customerPhone, customerName }, kot, receipt, inventoryDeducted, semiFgDeducted };
    });

    // WhatsApp Thank You — best-effort, AFTER the order transaction has
    // committed (never hold a DB transaction open across a network call).
    // A failed/unconfigured send never fails the order; the outcome is
    // surfaced to the cashier so they know whether it actually went out.
    let whatsapp: { attempted: boolean; sent: boolean; error?: string } = { attempted: false, sent: false };
    if (result.order.customerPhone) {
      const message = thankYouMessage({ customerName: result.order.customerName, orderNumber: result.order.orderNumber, totalAmount: result.receipt.totalAmount, branchName: result.order.branchName });
      const sendResult = await sendWhatsAppMessage(result.order.customerPhone, message, { relatedEntityType: "PosOrder", relatedEntityId: result.order.id });
      whatsapp = { attempted: true, sent: sendResult.ok, error: sendResult.ok ? undefined : sendResult.error };
    }

    return json({ ...result, whatsapp }, 201);
  });
}
