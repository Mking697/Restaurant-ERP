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
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { formatInr } from "@/lib/utils";
import { Plus, MessageCircle } from "lucide-react";

interface OrderRow { id: string; branchId: string; orderNumber: string; channel: string; tableNo: string; counterNo: string; totalAmount: string; tenderType: string; tenderCurrencyCode: string; tenderCurrencyAmount: string; status: string; createdAt: string; }
interface MenuItemRow { id: string; branchId: string; name: string; price: string; isActive: boolean; isSellable: boolean; }
interface OrderResult { order: { orderNumber: string }; kot: { name: string; qty: number }[]; receipt: { lines: { name: string; qty: number; price: string; lineTotal: string }[]; subtotal: string; taxAmount: string; totalAmount: string; gst: { configured: boolean; note?: string; rates?: { ratePercent: string; cgst: string; sgst: string; igst: string }[] }; currency: { tenderCurrencyCode: string; fxRateToInr: string; tenderCurrencyAmount: string } | null }; inventoryDeducted: { rawMaterialId: string; qtyDeducted: number }[]; whatsapp: { attempted: boolean; sent: boolean; error?: string }; }
interface CurrencyRateRow { id: string; currencyCode: string; rateToInr: string; updatedAt: string; }

const CHANNEL_VARIANT: Record<string, "default" | "secondary" | "warning" | "destructive"> = { DINE_IN: "default", TAKEAWAY: "secondary", SWIGGY: "warning", ZOMATO: "destructive" };
const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";

export default function PosPage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches } = useBranches();
  const allowed = hasCurrentModule(actor, "POS_CASHIER");
  const orderBranchId = actor.role === "SUPER_ADMIN" ? (selected !== "all" ? selected : "") : actor.branchId ?? "";

  const [orders, setOrders] = React.useState<OrderRow[]>([]);
  const [menuOptions, setMenuOptions] = React.useState<MenuItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);
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
  React.useEffect(() => {
    if (!allowed) return;
    let active = true; setLoading(true); setError("");
    requestJson<{ orders: OrderRow[] }>(ordersUrl).then((data) => { if (active) setOrders(data.orders); }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, ordersUrl, scopeKey]);

  React.useEffect(() => {
    if (!allowed || !orderBranchId) { setMenuOptions([]); return; }
    requestJson<{ menuItems: MenuItemRow[] }>(`/api/menu-items?branchId=${encodeURIComponent(orderBranchId)}`)
      .then((data) => setMenuOptions(data.menuItems.filter((m) => m.isSellable && m.isActive)))
      .catch(() => setMenuOptions([]));
  }, [allowed, orderBranchId]);

  React.useEffect(() => {
    if (!allowed) return;
    requestJson<{ currencyRates: CurrencyRateRow[] }>("/api/currency-rates").then((data) => setCurrencyRates(data.currencyRates)).catch(() => setCurrencyRates([]));
  }, [allowed]);

  function addLine() { setLines((prev) => [...prev, { menuItemId: menuOptions[0]?.id ?? "", qty: 1 }]); }
  function updateLine(index: number, patch: Partial<{ menuItemId: string; qty: number }>) { setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line))); }
  function removeLine(index: number) { setLines((prev) => prev.filter((_, i) => i !== index)); }

  async function submitOrder() {
    if (!orderBranchId || !lines.length) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await requestJson<OrderResult>("/api/pos/orders", { method: "POST", body: JSON.stringify({ branchId: orderBranchId, channel, tableNo, counterNo, customerPhone, customerName, tenderType, tenderCurrencyCode, lines }) });
      setResult(data);
      const refreshed = await requestJson<{ orders: OrderRow[] }>(ordersUrl);
      setOrders(refreshed.orders);
      setLines([]); setTableNo(""); setCustomerPhone(""); setCustomerName(""); setTenderCurrencyCode("INR");
    } catch (err) { setError(err instanceof Error ? err.message : "Order failed"); }
    finally { setBusy(false); }
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
      <PageHeader title={uiText("POS / Cashier")} description={uiText("Real orders: confirm explodes the BOM (incl. nested Semi-FG), deducts branch inventory, and splits KOT vs receipt.", "Real orders: confirm karte hi BOM explode hota hai (nested Semi-FG samet), branch inventory minus hoti hai, aur KOT vs receipt split hota hai.")}>
        <div className="flex gap-2">
        {isOwner && <Dialog open={ratesOpen} onOpenChange={(v) => { setRatesOpen(v); if (v) setError(""); }}>
          <DialogTrigger asChild><Button size="sm" variant="outline">{uiText("Currency Rates")}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{uiText("Exchange Rates")}</DialogTitle><DialogDescription>{uiText("1 unit of the foreign currency = this many INR. Each order locks in the rate at sale time — changing it here never alters past orders.", "1 unit foreign currency = itne INR. Har order apne time ka rate lock kar leta hai — yahan change karne se purane orders nahi badalte.")}</DialogDescription></DialogHeader>
            {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
            <Table><TableHeader><TableRow><TableHead>{uiText("Currency")}</TableHead><TableHead>{uiText("Rate (INR)")}</TableHead><TableHead>{uiText("Updated")}</TableHead></TableRow></TableHeader><TableBody>
              {currencyRates.map((r) => <TableRow key={r.id}><TableCell>{r.currencyCode}</TableCell><TableCell>₹{r.rateToInr}</TableCell><TableCell className="text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleDateString("en-IN")}</TableCell></TableRow>)}
            </TableBody></Table>
            {!currencyRates.length && <p className="text-sm text-muted-foreground">{uiText("No rates configured yet.")}</p>}
            <div className="flex items-end gap-2 pt-2">
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Code")}</span><input className={inputClass + " w-20 uppercase"} maxLength={3} value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="USD" /></label>
              <label className="block flex-1 space-y-1 text-xs font-medium"><span>{uiText("Rate to INR")}</span><input type="number" min="0.000001" step="0.000001" className={inputClass} value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="84.50" /></label>
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
        {allowed && <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setResult(null); setError(""); setLines(menuOptions[0] ? [{ menuItemId: menuOptions[0].id, qty: 1 }] : []); } }}>
          <DialogTrigger asChild><Button size="sm"><Plus /> {uiText("New Order")}</Button></DialogTrigger>
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
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Payment currency")}</span><select className={inputClass} value={tenderCurrencyCode} onChange={(e) => setTenderCurrencyCode(e.target.value)}><option value="INR">{uiText("INR (₹)")}</option>{currencyRates.map((r) => <option key={r.id} value={r.currencyCode}>{r.currencyCode} (1 = ₹{r.rateToInr})</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-xs font-medium"><span>{uiText("Customer name (optional)")}</span><input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={uiText("Rahul")} /></label>
                <label className="block space-y-1 text-xs font-medium"><span>{uiText("Customer WhatsApp (optional)")}</span><input className={inputClass} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="98765 43210" /></label>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">{uiText("Items")}</p>
                {lines.map((line, i) => <div key={i} className="flex gap-2">
                  <select className={inputClass} value={line.menuItemId} onChange={(e) => updateLine(i, { menuItemId: e.target.value })}>{menuOptions.map((m) => <option key={m.id} value={m.id}>{m.name} (₹{m.price})</option>)}</select>
                  <input type="number" min={1} max={500} className={inputClass + " w-20"} value={line.qty} onChange={(e) => updateLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                  <Button type="button" variant="outline" size="sm" onClick={() => removeLine(i)}>{uiText("Remove")}</Button>
                </div>)}
                <Button type="button" variant="outline" size="sm" disabled={!menuOptions.length} onClick={addLine}>{uiText("Add Item Line")}</Button>
                {!menuOptions.length && <p className="text-xs text-muted-foreground">{uiText("No sellable menu items in this branch — add some on the Menu & BOM page.")}</p>}
              </div>
            </div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{uiText("Cancel")}</Button>
              <Button disabled={busy || !orderBranchId || !lines.length} onClick={submitOrder}>{busy ? uiText("Placing…") : uiText("Confirm Order")}</Button>
            </DialogFooter>
            {result && <div className="mt-3 space-y-3 rounded-md border p-3 text-sm">
              <p className="font-medium">{uiText("Order")} {result.order.orderNumber} {uiText("confirmed.")}</p>
              <div><p className="font-medium">{uiText("KOT (kitchen copy, no price)")}</p><ul className="list-disc pl-5">{result.kot.map((k, i) => <li key={i}>{k.name} × {k.qty}</li>)}</ul></div>
              <div><p className="font-medium">{uiText("Receipt")}</p><ul className="list-disc pl-5">{result.receipt.lines.map((l, i) => <li key={i}>{l.name} × {l.qty} = ₹{l.lineTotal}</li>)}</ul>
                <p>{uiText("Subtotal:")} ₹{result.receipt.subtotal}</p>
                <p>{uiText("GST:")} ₹{result.receipt.taxAmount}{result.receipt.gst.configured && result.receipt.gst.rates ? " (" + result.receipt.gst.rates.map((r) => `${r.ratePercent}%: CGST ₹${r.cgst} + SGST ₹${r.sgst}${Number(r.igst) > 0 ? ` / IGST ₹${r.igst}` : ""}`).join(", ") + ")" : ""}</p>
                <p className="font-medium">{uiText("Total:")} ₹{result.receipt.totalAmount}</p>
                {!result.receipt.gst.configured && <p className="text-xs text-muted-foreground">{result.receipt.gst.note}</p>}
                {result.receipt.currency && <p className="text-sm">{uiText("Payable in")} {result.receipt.currency.tenderCurrencyCode}: <strong>{result.receipt.currency.tenderCurrencyAmount}</strong> ({uiText("rate")} ₹{result.receipt.currency.fxRateToInr})</p>}
              </div>
              <p className="text-xs text-muted-foreground">{uiText("Inventory deducted:")} {result.inventoryDeducted.map((d) => `${d.qtyDeducted}`).join(", ") || uiText("none (no BOM configured)")}</p>
              {result.whatsapp.attempted && <p className={result.whatsapp.sent ? "text-sm" : "text-sm text-destructive"}>{result.whatsapp.sent ? uiText("WhatsApp Thank You bhej diya.") : uiText("WhatsApp Thank You nahi bheja:") + " " + result.whatsapp.error}</p>}
            </div>}
          </DialogContent>
        </Dialog>}
        </div>
      </PageHeader>

      {!allowed ? <p role="alert">{uiText("POS / Cashier permission is required.")}</p> : <>
        {error && !open && <p role="alert" className="mb-4 text-destructive">{uiText(error)}</p>}
        <Card>
          <CardContent className="pt-5">
            {loading ? <p>{uiText("Loading today's orders…")}</p> : <Table>
              <TableHeader><TableRow><TableHead>{uiText("Order #")}</TableHead><TableHead>{uiText("Branch")}</TableHead><TableHead>{uiText("Channel")}</TableHead><TableHead>{uiText("Counter")}</TableHead><TableHead>{uiText("Table")}</TableHead><TableHead>{uiText("Amount")}</TableHead><TableHead>{uiText("Tender")}</TableHead><TableHead>{uiText("Time")}</TableHead><TableHead>{uiText("Status")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {orders.map((o) => <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.orderNumber}</TableCell>
                  <TableCell>{branches.find((b) => b.id === o.branchId)?.name ?? uiText("Own branch")}</TableCell>
                  <TableCell><Badge variant={CHANNEL_VARIANT[o.channel]}>{o.channel.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{o.counterNo === "COUNTER_2" ? uiText("Counter 2") : uiText("Counter 1")}</Badge></TableCell>
                  <TableCell>{o.tableNo || "-"}</TableCell>
                  <TableCell>{formatInr(Number(o.totalAmount))}{o.tenderCurrencyCode !== "INR" && <span className="ml-1 text-xs text-muted-foreground">({o.tenderCurrencyAmount} {o.tenderCurrencyCode})</span>}</TableCell>
                  <TableCell>{o.tenderType}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell><Badge variant={o.status === "VOIDED" ? "destructive" : "success"}>{o.status}</Badge></TableCell>
                </TableRow>)}
              </TableBody>
            </Table>}
            {!loading && !orders.length && <p>{uiText("No orders today in this scope.")}</p>}
          </CardContent>
        </Card>
      </>}
    </AppShell>
  );
}
