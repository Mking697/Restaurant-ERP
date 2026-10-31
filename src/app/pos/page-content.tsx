"use client";
import { useUiCopy } from "@/lib/ui-copy";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { formatInr } from "@/lib/utils";
import { useShiftStatus, ShiftHandoverGate } from "@/lib/shift-gate";
import { Plus, MessageCircle } from "lucide-react";

interface OrdersResponse { orders: OrderRow[]; visibilityScope: "actual" | "access-filtered"; salesSummary: { visibleTotal: string; actualTotal?: string; privateTotal?: string }; }
interface OrderRow { ownerOnly?: boolean; id: string; branchId: string; orderNumber: string; channel: string; tableNo: string; counterNo: string; totalAmount: string; tenderType: string; tenderCurrencyCode: string; tenderCurrencyAmount: string; status: string; createdAt: string; }
interface MenuItemRow { id: string; branchId: string; name: string; price: string; isActive: boolean; isSellable: boolean; }
interface OrderResult { order: { orderNumber: string }; kot: { name: string; qty: number }[]; receipt: { lines: { name: string; qty: number; price: string; lineTotal: string }[]; subtotal: string; taxAmount: string; totalAmount: string; vat: { rates: { ratePercent: string; taxableAmount: string; vatAmount: string }[] }; currency: { tenderCurrencyCode: string; fxRateToInr: string; tenderCurrencyAmount: string } | null }; inventoryDeducted: { rawMaterialId: string; qtyDeducted: number }[]; whatsapp: { attempted: boolean; sent: boolean; error?: string }; }
interface CurrencyRateRow { id: string; currencyCode: string; rateToInr: string; updatedAt: string; }

const CHANNEL_VARIANT: Record<string, "default" | "secondary" | "warning" | "destructive"> = { DINE_IN: "default", TAKEAWAY: "secondary", SWIGGY: "warning", ZOMATO: "destructive" };
const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";

export default function PosPage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  return <ScopedPos key={JSON.stringify([actor.id, actor.role, actor.branchId, actor.authenticated, actor.moduleAccess, selected])} />;
}
function ScopedPos() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches } = useBranches();
  const allowed = hasCurrentModule(actor, "POS_CASHIER");
  const orderBranchId = actor.role === "SUPER_ADMIN" ? (selected !== "all" ? selected : "") : actor.branchId ?? "";
  const shiftStatus = useShiftStatus(orderBranchId, allowed);

  const [orders, setOrders] = React.useState<OrderRow[]>([]);
  const [menuOptions, setMenuOptions] = React.useState<MenuItemRow[]>([]);
  const [menuLoading, setMenuLoading] = React.useState(true);
  const [menuError, setMenuError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [ordersError, setOrdersError] = React.useState("");
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [channel, setChannel] = React.useState("DINE_IN");
  const [tableNo, setTableNo] = React.useState("");
  const [counterNo, setCounterNo] = React.useState("COUNTER_1");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [tenderType, setTenderType] = React.useState("CASH");
  const [tenderCurrencyCode, setTenderCurrencyCode] = React.useState("INR");
  const [currencyRates, setCurrencyRates] = React.useState<CurrencyRateRow[]>([]);
  const [lines, setLines] = React.useState<{ menuItemId: string; qty: number }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<OrderResult | null>(null);

  const [ratesOpen, setRatesOpen] = React.useState(false);
  const [newCode, setNewCode] = React.useState("USD");
  const [newRate, setNewRate] = React.useState("");
  const [rateBusy, setRateBusy] = React.useState(false);
  const isOwner = actor.role === "SUPER_ADMIN";

  const [offerOpen, setOfferOpen] = React.useState(false);
  const [offerText, setOfferText] = React.useState("");
  const [offerValidUntil, setOfferValidUntil] = React.useState("");
  const [offerTargetCount, setOfferTargetCount] = React.useState<number | null>(null);
  const [offerBusy, setOfferBusy] = React.useState(false);
  const [offerResult, setOfferResult] = React.useState<{ targeted: number; sent: number; failed: number } | null>(null);

  const ordersUrl = "/api/pos/orders" + (selected !== "all" ? `?branchId=${encodeURIComponent(selected)}` : "");
  const scopeKey = `${actor.id}:${selected}`;
  const [salesSummary, setSalesSummary] = React.useState<OrdersResponse["salesSummary"] | null>(null);
  const [visibilityTarget, setVisibilityTarget] = React.useState<OrderRow | null>(null);
  const [visibilityReason, setVisibilityReason] = React.useState("");
  const [visibilityBusy, setVisibilityBusy] = React.useState(false);
  const [visibilityUnknown, setVisibilityUnknown] = React.useState(false);
  const [visibilityMessage, setVisibilityMessage] = React.useState("");
  const visibilityInFlight = React.useRef(false);
  const listVersion = React.useRef(0);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; listVersion.current++; }; }, []);

  const reloadOrders = React.useCallback(async (receipt?: OrderResult) => {
    if (!allowed || !mounted.current) return false;
    const version = ++listVersion.current;
    setLoading(true); setOrdersError(""); setOrders([]); setSalesSummary(null);
    // Do not retain a receipt while its current access is being rechecked.
    setResult(null);
    try {
      const data = await requestJson<OrdersResponse>(ordersUrl);
      if (!mounted.current || version !== listVersion.current) return false;
      const money = (v: unknown) => typeof v === "string" && /^\d+(?:\.\d{1,2})?$/.test(v) && Number.isFinite(Number(v));
      if (!Array.isArray(data.orders) || data.visibilityScope !== (isOwner ? "actual" : "access-filtered") ||
          !money(data.salesSummary?.visibleTotal) || (isOwner && (!money(data.salesSummary?.actualTotal) || !money(data.salesSummary?.privateTotal) || data.orders.some(o => typeof o.ownerOnly !== "boolean")))) {
        throw new Error("Could not verify order list and sales summary. Reload orders.");
      }
      setOrders(data.orders); // Access filtering is exclusively the server's responsibility.
      if (receipt && data.orders.some(o => o.orderNumber === receipt.order.orderNumber)) setResult(receipt);
      setSalesSummary(isOwner ? data.salesSummary : { visibleTotal: data.salesSummary.visibleTotal });
      setVisibilityUnknown(false); setVisibilityTarget(null);
      return true;
    } catch (err) {
      if (mounted.current && version === listVersion.current) setOrdersError(err instanceof Error ? err.message : "Could not reload orders.");
      return false;
    } finally { if (mounted.current && version === listVersion.current) setLoading(false); }
  }, [allowed, ordersUrl, scopeKey, isOwner]);
  React.useEffect(() => { void reloadOrders(); return () => { listVersion.current++; }; }, [reloadOrders]);

  async function changeVisibility() {
    if (!isOwner || !visibilityTarget || visibilityBusy || visibilityInFlight.current || visibilityUnknown || loading || ordersError || visibilityReason.trim().length < 3 || visibilityReason.trim().length > 500) return;
    const target = visibilityTarget;
    const ownerOnly = !target.ownerOnly;
    visibilityInFlight.current = true; setVisibilityBusy(true); setVisibilityMessage("");
    try {
      const data = await requestJson<{ order: { id: string; ownerOnly: boolean }; changed: boolean }>(`/api/pos/orders/${encodeURIComponent(target.id)}/visibility`, { method: "PATCH", body: JSON.stringify({ ownerOnly, reason: visibilityReason.trim() }) });
      if (!mounted.current) return;
      if (data.order?.id !== target.id || data.order.ownerOnly !== ownerOnly || typeof data.changed !== "boolean") throw new Error("Unverified visibility acknowledgment");
      setVisibilityTarget(null); setVisibilityReason("");
      setVisibilityMessage(data.changed ? "Visibility change confirmed." : "Visibility already matched; no change needed.");
      // A confirmed PATCH stays confirmed even when this separate GET fails.
      const refreshed = await reloadOrders();
      if (mounted.current && !refreshed) setVisibilityMessage("Visibility change confirmed. Could not reload orders; reload the list, do not submit again.");
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof RequestJsonError && err.outcome === "rejected") setVisibilityMessage(err.message);
      else {
        setVisibilityUnknown(true); setOrders([]); setSalesSummary(null); setResult(null);
        setVisibilityMessage("Visibility outcome unknown. The change may already be saved. Reload orders to check before making another change; do not retry blindly.");
      }
    } finally { visibilityInFlight.current = false; if (mounted.current) setVisibilityBusy(false); }
  }

  React.useEffect(() => {
    let active = true;
    setMenuOptions([]); setMenuError("");
    if (!allowed || !orderBranchId) { setMenuLoading(false); return; }
    setMenuLoading(true);
    requestJson<{ menuItems: MenuItemRow[] }>(`/api/menu-items?branchId=${encodeURIComponent(orderBranchId)}`)
      .then((data) => { if (active) setMenuOptions(data.menuItems.filter((m) => m.isSellable && m.isActive)); })
      .catch((err) => { if (active) setMenuError(err instanceof Error ? err.message : "Could not load branch menu."); })
      .finally(() => { if (active) setMenuLoading(false); });
    return () => { active = false; };
  }, [allowed, orderBranchId]);

  React.useEffect(() => {
    if (!allowed) return;
    requestJson<{ currencyRates: CurrencyRateRow[] }>("/api/currency-rates").then((data) => setCurrencyRates(data.currencyRates)).catch(() => setCurrencyRates([]));
  }, [allowed]);

  function addLine() { setLines((prev) => [...prev, { menuItemId: menuOptions[0]?.id ?? "", qty: 1 }]); }
  function updateLine(index: number, patch: Partial<{ menuItemId: string; qty: number }>) { setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line))); }
  function removeLine(index: number) { setLines((prev) => prev.filter((_, i) => i !== index)); }

  const canOrder = allowed && !!orderBranchId && !loading && !ordersError && !visibilityUnknown && !visibilityBusy && !menuLoading && !menuError && !shiftStatus.loading && !shiftStatus.error && !shiftStatus.pendingHandover;
  React.useEffect(() => { if (!allowed || !orderBranchId || ordersError || menuError || shiftStatus.loading || shiftStatus.error || shiftStatus.pendingHandover) setOpen(false); }, [allowed, orderBranchId, ordersError, menuError, shiftStatus.loading, shiftStatus.error, shiftStatus.pendingHandover]);
  const orderInFlight = React.useRef(false);
  async function submitOrder() {
    if (!canOrder || busy || orderInFlight.current || !lines.length) return;
    orderInFlight.current = true;
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await requestJson<OrderResult>("/api/pos/orders", { method: "POST", body: JSON.stringify({ branchId: orderBranchId, channel, tableNo, counterNo, customerPhone, customerName, tenderType, tenderCurrencyCode, lines }) });
      setResult(data);
      setLines([]); setTableNo(""); setCustomerPhone(""); setCustomerName(""); setTenderCurrencyCode("INR");
      if (!await reloadOrders(data)) setError("Order confirmed. Could not reload the order list; do not submit it again.");
    } catch (err) { setError(err instanceof Error ? err.message : "Order failed"); }
    finally { orderInFlight.current = false; setBusy(false); }
  }

  async function loadOfferTarget() {
    try {
      const url = "/api/whatsapp/offer-alert" + (orderBranchId ? `?branchId=${encodeURIComponent(orderBranchId)}` : "");
      const data = await requestJson<{ targetCount: number }>(url);
      setOfferTargetCount(data.targetCount);
    } catch { setOfferTargetCount(null); }
  }

  async function sendOffer() {
    setOfferBusy(true); setError(""); setOfferResult(null);
    try {
      const data = await requestJson<{ targeted: number; sent: number; failed: number }>("/api/whatsapp/offer-alert", { method: "POST", body: JSON.stringify({ branchId: orderBranchId || undefined, offerText, validUntil: offerValidUntil }) });
      setOfferResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Offer send failed"); }
    finally { setOfferBusy(false); }
  }

  async function saveRate() {
    setRateBusy(true); setError("");
    try {
      await requestJson("/api/currency-rates", { method: "POST", body: JSON.stringify({ currencyCode: newCode, rateToInr: Number(newRate) }) });
      const data = await requestJson<{ currencyRates: CurrencyRateRow[] }>("/api/currency-rates");
      setCurrencyRates(data.currencyRates);
      setNewRate("");
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setRateBusy(false); }
  }

  return (
    <AppShell activeHref="/pos">
      <PageHeader title={uiText("POS / Cashier")} description={uiText("Confirm deducts direct raw materials and already-produced Semi-FG stock, then creates a KOT and receipt. The server rechecks shift status when saving.", "Confirm par direct raw aur pehle se produced Semi-FG stock deduct hota hai, phir KOT aur receipt bante hain. Save par server shift status dobara check karta hai.")}>
        <div className="flex flex-wrap gap-2">
        {isOwner && <Dialog open={ratesOpen} onOpenChange={(v) => { setRatesOpen(v); if (v) setError(""); }}>
          <DialogTrigger asChild><Button size="sm" variant="outline">{uiText("Currency Rates")}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{uiText("Exchange Rates")}</DialogTitle><DialogDescription>{uiText("1 unit of the foreign currency = this many TSh. Each order locks in the rate at sale time — changing it here never alters past orders.", "1 unit foreign currency = itne TSh. Har order apne time ka rate lock kar leta hai — yahan change karne se purane orders nahi badalte.")}</DialogDescription></DialogHeader>
            {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
            <Table><TableHeader><TableRow><TableHead>{uiText("Currency")}</TableHead><TableHead>{uiText("Rate (TSh)")}</TableHead><TableHead>{uiText("Updated")}</TableHead></TableRow></TableHeader><TableBody>
              {currencyRates.map((r) => <TableRow key={r.id}><TableCell>{r.currencyCode}</TableCell><TableCell>TSh {r.rateToInr}</TableCell><TableCell className="text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleDateString("en-GB")}</TableCell></TableRow>)}
            </TableBody></Table>
            {!currencyRates.length && <p className="text-sm text-muted-foreground">{uiText("No rates configured yet.")}</p>}
            <div className="flex items-end gap-2 pt-2">
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Code")}</span><input className={inputClass + " w-20 uppercase"} maxLength={3} value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="USD" /></label>
              <label className="block flex-1 space-y-1 text-xs font-medium"><span>{uiText("Rate to TSh")}</span><input type="number" min="0.000001" step="0.000001" className={inputClass} value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="2500.00" /></label>
              <Button disabled={rateBusy || !newCode || !newRate} onClick={saveRate}>{rateBusy ? uiText("Saving…") : uiText("Save Rate")}</Button>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setRatesOpen(false)}>{uiText("Close")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
        {allowed && <Dialog open={offerOpen} onOpenChange={(v) => { setOfferOpen(v); if (v) { setError(""); setOfferResult(null); setOfferText(""); setOfferValidUntil(""); void loadOfferTarget(); } }}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><MessageCircle className="size-4" /> {uiText("Offer Alert")}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{uiText("WhatsApp Offer Alert")}</DialogTitle><DialogDescription>{uiText("Sends to every distinct customer WhatsApp number captured on a past order in this scope — not a fabricated list.", "Is scope mein jin past orders mein customer WhatsApp number capture hua hai, sabko bhejta hai — koi fake list nahi.")}</DialogDescription></DialogHeader>
            {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
            <p className="text-sm">{uiText("Target customers:")} <strong>{offerTargetCount ?? "…"}</strong></p>
            <label className="block space-y-1 text-xs font-medium"><span>{uiText("Offer text")}</span><textarea className={inputClass} rows={3} value={offerText} onChange={(e) => setOfferText(e.target.value)} placeholder={uiText("20% off on all starters today!")} /></label>
            <label className="block space-y-1 text-xs font-medium"><span>{uiText("Valid until (optional)")}</span><input className={inputClass} value={offerValidUntil} onChange={(e) => setOfferValidUntil(e.target.value)} placeholder="31 Oct" /></label>
            {offerResult && <p className="text-sm">{uiText("Sent:")} {offerResult.sent} / {offerResult.targeted} {offerResult.failed > 0 && <span className="text-destructive">({offerResult.failed} {uiText("failed")})</span>}</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOfferOpen(false)}>{uiText("Close")}</Button><Button disabled={offerBusy || !offerText.trim() || !offerTargetCount} onClick={sendOffer}>{offerBusy ? uiText("Sending…") : uiText("Send Offer Alert")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
        {allowed && <Dialog open={open && canOrder} onOpenChange={(v) => { if (v && !canOrder) return; setOpen(v); if (v) { setResult(null); setError(""); setLines(menuOptions[0] ? [{ menuItemId: menuOptions[0].id, qty: 1 }] : []); } }}>
          <DialogTrigger asChild><Button size="sm" disabled={!canOrder || busy}><Plus /> {uiText("New Order")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{uiText("New Order")}</DialogTitle><DialogDescription>{uiText("Confirm deducts real branch inventory — insufficient stock rejects the whole order.", "Confirm karte hi real branch inventory minus hoti hai — stock kam ho to poora order reject hoga.")}</DialogDescription></DialogHeader>
            {!orderBranchId ? <p role="alert" className="text-destructive">{uiText("Select a branch first.")}</p> : <div className="space-y-3">
              {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-xs font-medium"><span>{uiText("Channel")}</span><select className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="DINE_IN">{uiText("Dine-in")}</option><option value="TAKEAWAY">{uiText("Takeaway")}</option><option value="SWIGGY">{uiText("Swiggy")}</option><option value="ZOMATO">{uiText("Zomato")}</option></select></label>
                <label className="block space-y-1 text-xs font-medium"><span>{uiText("Table no.")}</span><input className={inputClass} value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="T-12" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-xs font-medium"><span>{uiText("Counter")}</span><select className={inputClass} value={counterNo} onChange={(e) => setCounterNo(e.target.value)}><option value="COUNTER_1">{uiText("Counter 1")}</option><option value="COUNTER_2">{uiText("Counter 2")}</option></select></label>
                <label className="block space-y-1 text-xs font-medium"><span>{uiText("Tender")}</span><select className={inputClass} value={tenderType} onChange={(e) => setTenderType(e.target.value)}><option value="CASH">{uiText("Cash")}</option><option value="UPI">{uiText("UPI")}</option><option value="CARD">{uiText("Card")}</option></select></label>
              </div>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Payment currency")}</span><select className={inputClass} value={tenderCurrencyCode} onChange={(e) => setTenderCurrencyCode(e.target.value)}><option value="INR">{uiText("TZS (TSh)")}</option>{currencyRates.map((r) => <option key={r.id} value={r.currencyCode}>{r.currencyCode} (1 = TSh {r.rateToInr})</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-xs font-medium"><span>{uiText("Customer name (optional)")}</span><input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={uiText("Rahul")} /></label>
                <label className="block space-y-1 text-xs font-medium"><span>{uiText("Customer WhatsApp (optional)")}</span><input className={inputClass} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="712 345 678" /></label>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">{uiText("Items")}</p>
                {lines.map((line, i) => <div key={i} className="flex gap-2">
                  <select className={inputClass} value={line.menuItemId} onChange={(e) => updateLine(i, { menuItemId: e.target.value })}>{menuOptions.map((m) => <option key={m.id} value={m.id}>{m.name} ({formatInr(Number(m.price))})</option>)}</select>
                  <input type="number" min={1} max={500} className={inputClass + " w-20"} value={line.qty} onChange={(e) => updateLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                  <Button type="button" variant="outline" size="sm" onClick={() => removeLine(i)}>{uiText("Remove")}</Button>
                </div>)}
                <Button type="button" variant="outline" size="sm" disabled={!menuOptions.length} onClick={addLine}>{uiText("Add Item Line")}</Button>
                {!menuOptions.length && <p className="text-xs text-muted-foreground">{uiText("No sellable menu items in this branch — add some on the Menu & BOM page.")}</p>}
              </div>
            </div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{uiText("Cancel")}</Button>
              <Button disabled={busy || !canOrder || !lines.length} onClick={submitOrder}>{busy ? uiText("Placing…") : uiText("Confirm Order")}</Button>
            </DialogFooter>
            {result && <div className="mt-3 space-y-3 rounded-md border p-3 text-sm">
              <p className="font-medium">{uiText("Order")} {result.order.orderNumber} {uiText("confirmed.")}</p>
              <div><p className="font-medium">{uiText("KOT (kitchen copy, no price)")}</p><ul className="list-disc pl-5">{result.kot.map((k, i) => <li key={i}>{k.name} × {k.qty}</li>)}</ul></div>
              <div><p className="font-medium">{uiText("Receipt")}</p><ul className="list-disc pl-5">{result.receipt.lines.map((l, i) => <li key={i}>{l.name} × {l.qty} = {formatInr(Number(l.lineTotal))}</li>)}</ul>
                <p>{uiText("Subtotal:")} {formatInr(Number(result.receipt.subtotal))}</p>
                <p>{uiText("VAT:")} {formatInr(Number(result.receipt.taxAmount))}{result.receipt.vat.rates.length ? " (" + result.receipt.vat.rates.map((r) => `${r.ratePercent}%: ${formatInr(Number(r.vatAmount))}`).join(", ") + ")" : ""}</p>
                <p className="font-medium">{uiText("Total:")} {formatInr(Number(result.receipt.totalAmount))}</p>
                {result.receipt.currency && <p className="text-sm">{uiText("Payable in")} {result.receipt.currency.tenderCurrencyCode}: <strong>{result.receipt.currency.tenderCurrencyAmount}</strong> ({uiText("rate")} TSh {result.receipt.currency.fxRateToInr})</p>}
              </div>
              <p className="text-xs text-muted-foreground">{uiText("Inventory deducted:")} {result.inventoryDeducted.map((d) => `${d.qtyDeducted}`).join(", ") || uiText("none (no BOM configured)")}</p>
              {result.whatsapp.attempted && <p className={result.whatsapp.sent ? "text-sm" : "text-sm text-destructive"}>{result.whatsapp.sent ? uiText("WhatsApp thank-you sent.", "WhatsApp Thank You bhej diya.") : uiText("WhatsApp thank-you was not sent:", "WhatsApp Thank You nahi bheja:") + " " + result.whatsapp.error}</p>}
            </div>}
          </DialogContent>
        </Dialog>}
        </div>
      </PageHeader>

      {!allowed ? <p role="alert">{uiText("POS / Cashier permission is required.")}</p> : <ShiftHandoverGate branchId={orderBranchId} pendingHandover={shiftStatus.pendingHandover} loading={shiftStatus.loading} error={shiftStatus.error} onRetry={shiftStatus.reload} onAccepted={shiftStatus.reload}><>
        {menuError && <p role="alert" className="mb-4 text-destructive">{uiText(menuError)} {uiText("Reload the page to reload the branch menu.")}</p>}
        {error && !open && <p role="alert" className="mb-4 text-destructive">{uiText(error)}</p>}
        {visibilityMessage && <p role="status" className="mb-3 text-sm">{uiText(visibilityMessage)}</p>}
        {ordersError && <p role="alert" className="mb-3 text-destructive">{uiText(ordersError)}</p>}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{uiText(isOwner ? "Today's actual orders, including Owner-only orders." : "Visible sales — access-filtered. Not actual branch sales.")}</p>
          <Button variant="outline" size="sm" disabled={loading || visibilityBusy || busy} onClick={() => reloadOrders()}>{uiText("Reload orders")}</Button>
        </div>
        {!loading && !ordersError && !visibilityUnknown && salesSummary && <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {isOwner && <Card><CardContent className="pt-4"><p className="text-sm">{uiText("Actual sales")}</p><strong>{formatInr(Number(salesSummary.actualTotal))}</strong></CardContent></Card>}
          <Card><CardContent className="pt-4"><p className="text-sm">{uiText(isOwner ? "Staff-visible sales" : "Visible sales — access-filtered")}</p><strong>{formatInr(Number(salesSummary.visibleTotal))}</strong></CardContent></Card>
          {isOwner && <Card><CardContent className="pt-4"><p className="text-sm">{uiText("Private sales")}</p><strong>{formatInr(Number(salesSummary.privateTotal))}</strong></CardContent></Card>}
        </div>}
        {isOwner && <Dialog open={!!visibilityTarget} onOpenChange={(v) => { if (!v && !visibilityBusy) setVisibilityTarget(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{uiText(visibilityTarget?.ownerOnly ? "Restore staff visibility" : "Make Owner-only")}</DialogTitle><DialogDescription>{uiText("Only operational visibility changes. Actual sales, tax, inventory and cash remain unchanged. Previously downloaded receipts cannot be revoked.")}</DialogDescription></DialogHeader>
            <p className="text-sm">{visibilityTarget?.orderNumber}</p>
            <label className="block space-y-1 text-sm"><span>{uiText("Reason (3–500 characters)")}</span><textarea className={inputClass} minLength={3} maxLength={500} value={visibilityReason} disabled={visibilityBusy || visibilityUnknown} onChange={(e) => setVisibilityReason(e.target.value)} /></label>
            {visibilityMessage && <p role="status" className="text-sm">{uiText(visibilityMessage)}</p>}
            <DialogFooter><Button variant="outline" disabled={visibilityBusy} onClick={() => setVisibilityTarget(null)}>{uiText("Cancel")}</Button>
              {visibilityUnknown ? <Button disabled={loading || visibilityBusy} onClick={() => reloadOrders()}>{uiText("Reload orders")}</Button> : <Button disabled={visibilityBusy || loading || !!ordersError || visibilityReason.trim().length < 3 || visibilityReason.trim().length > 500} onClick={changeVisibility}>{uiText(visibilityBusy ? "Saving…" : visibilityTarget?.ownerOnly ? "Confirm restore" : "Confirm Owner-only")}</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>}
        <Card>
          <CardContent className="pt-5">
            {loading ? <p>{uiText("Loading today's orders…")}</p> : ordersError || visibilityUnknown ? <p>{uiText("Order list unavailable. Reload orders to verify current access.")}</p> : <Table>
              <TableHeader><TableRow><TableHead>{uiText("Order #")}</TableHead><TableHead>{uiText("Branch")}</TableHead><TableHead>{uiText("Channel")}</TableHead><TableHead>{uiText("Counter")}</TableHead><TableHead>{uiText("Table")}</TableHead><TableHead>{uiText("Amount")}</TableHead><TableHead>{uiText("Tender")}</TableHead><TableHead>{uiText("Time")}</TableHead><TableHead>{uiText("Status")}</TableHead>{isOwner && <TableHead>{uiText("Visibility")}</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {orders.map((o) => <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.orderNumber}</TableCell>
                  <TableCell>{branches.find((b) => b.id === o.branchId)?.name ?? uiText("Own branch")}</TableCell>
                  <TableCell><Badge variant={CHANNEL_VARIANT[o.channel]}>{o.channel.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{o.counterNo === "COUNTER_2" ? uiText("Counter 2") : uiText("Counter 1")}</Badge></TableCell>
                  <TableCell>{o.tableNo || "-"}</TableCell>
                  <TableCell>{formatInr(Number(o.totalAmount))}{o.tenderCurrencyCode !== "INR" && <span className="ml-1 text-xs text-muted-foreground">({o.tenderCurrencyAmount} {o.tenderCurrencyCode})</span>}</TableCell>
                  <TableCell>{o.tenderType}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell><Badge variant={o.status === "VOIDED" ? "destructive" : "success"}>{o.status}</Badge></TableCell>
                  {isOwner && <TableCell><div className="flex flex-wrap items-center gap-2"><Badge variant={o.ownerOnly ? "warning" : "outline"}>{uiText(o.ownerOnly ? "Owner-only" : "Staff-visible")}</Badge><Button size="sm" variant="outline" disabled={visibilityBusy || visibilityUnknown || busy} onClick={() => { setVisibilityTarget(o); setVisibilityReason(""); setVisibilityMessage(""); }}>{uiText(o.ownerOnly ? "Restore staff visibility" : "Make Owner-only")}</Button></div></TableCell>}
                </TableRow>)}
              </TableBody>
            </Table>}
            {!loading && !ordersError && !visibilityUnknown && !orders.length && <p>{uiText("No orders today in this scope.")}</p>}
          </CardContent>
        </Card>
      </></ShiftHandoverGate>}
    </AppShell>
  );
}
