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
import { PosLifecyclePanel, type LifecyclePending } from "./lifecycle-panel";

interface OrdersResponse { orders: OrderRow[]; visibilityScope: "actual" | "access-filtered"; salesSummary: { visibleTotal: string; actualTotal?: string; privateTotal?: string }; }
interface OrderRow { ownerOnly?: boolean; operatingConcept: "FAST_FOOD" | "CONVENTIONAL"; id: string; branchId: string; orderNumber: string; channel: string; tableNo: string; counterNo: string; totalAmount: string; tenderType: string; tenderCurrencyCode: string; tenderCurrencyAmount: string; status: string; createdAt: string; }
interface MenuItemRow { id: string; branchId: string; name: string; price: string; isActive: boolean; isSellable: boolean; }
interface OrderResult { order: { id?: string; orderNumber: string; status?: string; flow?: "PAYMENT_FIRST" | "PRODUCTION_FIRST" }; tickets?: { ticketNumber: string; ticketType: "KOT" | "BOT"; lines: { name: string; qty: number }[] }[]; kot: { name: string; qty: number }[]; receipt: { receiptNumber?: string; lines: { name: string; qty: number; price: string; lineTotal: string }[]; subtotal: string; taxAmount: string; totalAmount: string; vat: { rates: { ratePercent: string; taxableAmount: string; vatAmount: string }[] }; currency: { tenderCurrencyCode: string; fxRateToInr: string; tenderCurrencyAmount: string } | null } | null; inventoryDeducted: { rawMaterialId: string; qtyDeducted: number }[]; whatsapp: { attempted: boolean; sent: boolean; error?: string }; }
interface CurrencyRateRow { id: string; currencyCode: string; rateToInr: string; updatedAt: string; }

const CHANNEL_VARIANT: Record<string, "default" | "secondary" | "warning" | "destructive"> = { DINE_IN: "default", TAKEAWAY: "secondary", SWIGGY: "warning", ZOMATO: "destructive" };
const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
const newAttemptKey = () => `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
type MutationLock = { kind: "legacy" | "lifecycle"; identity: string } | null;

export default function PosPage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const identity = JSON.stringify([actor.id, actor.role, actor.branchId, actor.authenticated, actor.moduleAccess]);
  // Preserve lifecycle uncertainty across scope remounts; quarantine it on authority change.
  const pendingLifecycle = React.useRef<LifecyclePending | null>(null);
  const mutationLock = React.useRef<MutationLock>(null);
  const scopeLock = React.useRef<{ identity: string; selected: string } | null>(null);
  const currentIdentity = React.useRef(identity);
  currentIdentity.current = identity;
  if (scopeLock.current && scopeLock.current.identity !== identity) scopeLock.current = null;
  if (mutationLock.current?.kind === "legacy" && mutationLock.current.identity !== identity) mutationLock.current = null;
  const [, refreshScope] = React.useState(0);
  // Keep exact intent alive across branch changes, but not across authority changes.
  const scope = pendingLifecycle.current?.identity === identity ? pendingLifecycle.current.branchId : scopeLock.current?.identity === identity ? scopeLock.current.selected : selected;
  return <ScopedPos key={JSON.stringify([identity, scope])} selectedScope={scope} pendingLifecycle={pendingLifecycle} mutationLock={mutationLock} onPendingChange={pending => {
    if (currentIdentity.current !== identity) return;
    scopeLock.current = pending ? { identity, selected: scope } : null;
    refreshScope(value => value + 1);
  }} />;
}
function ScopedPos({ selectedScope, onPendingChange, pendingLifecycle: outerPending, mutationLock: outerLock }: { selectedScope?: string; onPendingChange?: (pending: boolean) => void; pendingLifecycle?: React.MutableRefObject<LifecyclePending | null>; mutationLock?: React.MutableRefObject<MutationLock> } = {}) {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const identity = JSON.stringify([actor.id, actor.role, actor.branchId, actor.authenticated, actor.moduleAccess]);
  const localPending = React.useRef<LifecyclePending | null>(null);
  const localLock = React.useRef<MutationLock>(null);
  const pendingLifecycle = outerPending ?? localPending;
  const sharedLock = outerLock ?? localLock;
  const [, refreshMutation] = React.useState(0);
  function acquireMutation(kind: "legacy" | "lifecycle") {
    const lock = sharedLock.current;
    if ((pendingLifecycle.current && pendingLifecycle.current.identity !== identity) || (lock && (lock.kind !== kind || lock.identity !== identity))) return false;
    sharedLock.current = { kind, identity }; refreshMutation(value => value + 1); return true;
  }
  function releaseMutation(kind: "legacy" | "lifecycle") {
    if (sharedLock.current?.kind === kind && sharedLock.current.identity === identity) sharedLock.current = null;
    refreshMutation(value => value + 1);
  }
  const requestedSelection = useSelectedBranchId();
  const selected = selectedScope ?? requestedSelection;
  const { branches } = useBranches();
  const allowed = hasCurrentModule(actor, "POS_CASHIER");
  const orderBranchId = actor.role === "SUPER_ADMIN" ? (selected !== "all" ? selected : "") : actor.branchId ?? "";
  const operatingConcept = branches.find(branch => branch.id === orderBranchId)?.operatingConcept ?? "FAST_FOOD";
  const pendingScopeMessage = requestedSelection !== selected ? `Pending order outcome in ${branches.find(branch => branch.id === orderBranchId)?.name ?? orderBranchId}. Replay the exact request here before switching branch scope.` : "";
  const shiftStatus = useShiftStatus(orderBranchId, allowed);

  const [orders, setOrders] = React.useState<OrderRow[]>([]);
  const [lifecycleRefreshToken, refreshLifecycle] = React.useState(0);
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
  const [openOrderTarget, setOpenOrderTarget] = React.useState<OrderRow | null>(null);
  const [openOrderMode, setOpenOrderMode] = React.useState<"ADD" | "SETTLE">("ADD");
  const [openOrderLines, setOpenOrderLines] = React.useState<{ menuItemId: string; qty: number }[]>([]);
  const orderAttempt = React.useRef<{ key: string; payload: Record<string, unknown>; hadUnknown?: boolean } | null>(null);
  const openOrderAttempt = React.useRef<{ kind: "ADD" | "SETTLE"; orderId: string; key: string; payload: Record<string, unknown>; hadUnknown?: boolean } | null>(null);
  const mutationLocked = busy || !!orderAttempt.current || !!openOrderAttempt.current || !!sharedLock.current || !!pendingLifecycle.current;

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
    if (!isOwner || !visibilityTarget || mutationLocked || sharedLock.current || pendingLifecycle.current || visibilityBusy || visibilityInFlight.current || visibilityUnknown || loading || ordersError || visibilityReason.trim().length < 3 || visibilityReason.trim().length > 500) return;
    const target = visibilityTarget;
    const ownerOnly = !target.ownerOnly;
    visibilityInFlight.current = true; setVisibilityBusy(true); setVisibilityMessage("");
    try {
      const data = await requestJson<{ order: { id: string; ownerOnly: boolean }; changed: boolean }>(`/api/pos/orders/${encodeURIComponent(target.id)}/visibility`, { method: "PATCH", body: JSON.stringify({ ownerOnly, reason: visibilityReason.trim() }) });
      if (!mounted.current) return;
      if (data.order?.id !== target.id || data.order.ownerOnly !== ownerOnly || typeof data.changed !== "boolean") throw new Error("Unverified visibility acknowledgment");
      refreshLifecycle(value => value + 1);
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
  React.useEffect(() => { if (!orderAttempt.current && (!allowed || !orderBranchId || ordersError || menuError || shiftStatus.loading || shiftStatus.error || shiftStatus.pendingHandover)) setOpen(false); }, [allowed, orderBranchId, ordersError, menuError, shiftStatus.loading, shiftStatus.error, shiftStatus.pendingHandover]);
  const orderInFlight = React.useRef(false);
  function beginOpenOrder(target: OrderRow, mode: "ADD" | "SETTLE") {
    if (!allowed || loading || ordersError || visibilityUnknown || visibilityBusy || sharedLock.current || pendingLifecycle.current || orderInFlight.current || orderAttempt.current || openOrderAttempt.current) return;
    setOpen(false); setOpenOrderMode(mode); setOpenOrderTarget(target); setError("");
    setTenderType("CASH"); setTenderCurrencyCode("INR");
    setOpenOrderLines(target.branchId === orderBranchId && menuOptions[0] ? [{ menuItemId: menuOptions[0].id, qty: 1 }] : []);
  }
  async function submitOrder() {
    if (!mounted.current || !canOrder || visibilityInFlight.current || busy || orderInFlight.current || openOrderAttempt.current || !lines.length || !acquireMutation("legacy")) return;
    orderInFlight.current = true;
    onPendingChange?.(true);
    setBusy(true); setError(""); setResult(null);
    try {
      const payload = orderAttempt.current?.payload ?? { branchId: orderBranchId, channel, tableNo, counterNo, customerPhone, customerName, tenderType, tenderCurrencyCode, lines, idempotencyKey: newAttemptKey() };
      orderAttempt.current ??= { key: String(payload.idempotencyKey), payload };
      const data = await requestJson<OrderResult>("/api/pos/orders", { method: "POST", body: JSON.stringify(payload) });
      orderAttempt.current = null;
      refreshLifecycle(value => value + 1);
      setResult(data); setOpen(false);
      setLines([]); setTableNo(""); setCustomerPhone(""); setCustomerName(""); setTenderCurrencyCode("INR");
      if (!await reloadOrders(data)) setError("Order confirmed. Could not reload the order list; do not submit it again.");
    } catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "rejected" && !orderAttempt.current?.hadUnknown) orderAttempt.current = null;
      else if (orderAttempt.current) orderAttempt.current.hadUnknown = true;
      setError(orderAttempt.current ? "Order outcome unknown. Replay exact request with the same key; do not create a new order." : err instanceof Error ? err.message : "Order failed");
    }
    finally { orderInFlight.current = false; setBusy(false); if (!orderAttempt.current) { releaseMutation("legacy"); onPendingChange?.(false); } }
  }

  async function mutateOpenOrder() {
    if (!mounted.current || !openOrderTarget || busy || visibilityInFlight.current || orderInFlight.current || orderAttempt.current || !canOrder || openOrderTarget.branchId !== orderBranchId) return;
    if (openOrderAttempt.current && (openOrderAttempt.current.orderId !== openOrderTarget.id || openOrderAttempt.current.kind !== openOrderMode)) return;
    if (!acquireMutation("legacy")) return;
    orderInFlight.current = true;
    onPendingChange?.(true);
    const kind = openOrderMode;
    const payload = openOrderAttempt.current?.orderId === openOrderTarget.id && openOrderAttempt.current.kind === kind
      ? openOrderAttempt.current.payload
      : kind === "ADD" ? { lines: openOrderLines, idempotencyKey: newAttemptKey() } : { tenderType, tenderCurrencyCode, idempotencyKey: newAttemptKey() };
    openOrderAttempt.current ??= { kind, orderId: openOrderTarget.id, key: String(payload.idempotencyKey), payload };
    setBusy(true); setError("");
    try {
      const url = `/api/pos/orders/${encodeURIComponent(openOrderTarget.id)}/${kind === "ADD" ? "lines" : "settle"}`;
      const data = await requestJson<Record<string, unknown>>(url, { method: "POST", body: JSON.stringify(payload) });
      openOrderAttempt.current = null; setOpenOrderTarget(null); setOpenOrderLines([]);
      refreshLifecycle(value => value + 1);
      if (kind === "SETTLE") {
        const settlement = data as unknown as OrderResult;
        const settlementResult = { ...settlement, order: { ...settlement.order, flow: "PRODUCTION_FIRST" as const }, kot: [], whatsapp: { attempted: false, sent: false } };
        if (!await reloadOrders(settlementResult)) setError("Settlement confirmed. Could not reload the order list; do not submit it again.");
      } else {
        const dispatchResult = { ...(data as unknown as OrderResult), kot: [], receipt: null, whatsapp: { attempted: false, sent: false } };
        if (!await reloadOrders(dispatchResult)) setError("Items confirmed. Could not reload the order list; do not submit them again.");
      }
    } catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "rejected" && !openOrderAttempt.current?.hadUnknown) openOrderAttempt.current = null;
      else if (openOrderAttempt.current) openOrderAttempt.current.hadUnknown = true;
      setError(openOrderAttempt.current ? "Open-order outcome unknown. Replay exact request with the same key; do not start another mutation." : err instanceof Error ? err.message : "Order update failed");
    } finally { orderInFlight.current = false; setBusy(false); if (!openOrderAttempt.current) { releaseMutation("legacy"); onPendingChange?.(false); } }
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
      <PageHeader title={uiText("POS / Cashier")} description={uiText("Fast-food and non-dine-in orders are paid first. Conventional dine-in validates and posts stock when KOT/BOT tickets are dispatched, then creates the receipt when payment is settled.")}>
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
        {allowed && <Dialog open={open && (canOrder || !!orderAttempt.current)} onOpenChange={(v) => { if (!v && orderAttempt.current) return; if (v && (!canOrder || orderInFlight.current || orderAttempt.current || openOrderAttempt.current)) return; setOpen(v); if (v) { setResult(null); setError(""); setLines(menuOptions[0] ? [{ menuItemId: menuOptions[0].id, qty: 1 }] : []); } }}>
          <DialogTrigger asChild><Button size="sm" disabled={!canOrder || mutationLocked}><Plus /> {uiText("New Order")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{uiText("New Order")}</DialogTitle><DialogDescription>{uiText(operatingConcept === "CONVENTIONAL" && channel === "DINE_IN" ? "This validates and posts stock, opens the table, and dispatches KOT/BOT tickets. Payment and receipt happen at settlement." : "Confirm records payment, deducts real branch inventory, and creates tickets plus receipt atomically.")}</DialogDescription></DialogHeader>
            {pendingScopeMessage && <p role="alert">{uiText(pendingScopeMessage)}</p>}
            {!orderBranchId ? <p role="alert" className="text-destructive">{uiText("Select a branch first.")}</p> : <fieldset disabled={mutationLocked} className="space-y-3">
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
            </fieldset>}
            <DialogFooter>
              <Button variant="outline" disabled={busy || !!orderAttempt.current} onClick={() => setOpen(false)}>{uiText("Cancel")}</Button>
              <Button disabled={busy || !canOrder || !lines.length} onClick={submitOrder}>{busy ? uiText("Placing…") : uiText(orderAttempt.current ? "Replay exact request" : "Confirm Order")}</Button>
            </DialogFooter>

          </DialogContent>
        </Dialog>}
        </div>
      </PageHeader>

      {!allowed ? <p role="alert">{uiText("POS / Cashier permission is required.")}</p> : <ShiftHandoverGate branchId={orderBranchId} pendingHandover={shiftStatus.pendingHandover} loading={shiftStatus.loading} error={shiftStatus.error} onRetry={shiftStatus.reload} onAccepted={shiftStatus.reload}><>
        {pendingScopeMessage && <p role="alert">{uiText(pendingScopeMessage)}</p>}
        <PosLifecyclePanel refreshToken={lifecycleRefreshToken} branchId={orderBranchId} branchName={branches.find(branch => branch.id === orderBranchId)?.name ?? orderBranchId} operatingConcept={operatingConcept} identity={identity} allowed={allowed} canMutate={canOrder && !busy && !visibilityBusy && !visibilityInFlight.current && !visibilityUnknown && !orderAttempt.current && !openOrderAttempt.current} menuOptions={menuOptions} menuLoading={menuLoading} menuError={menuError} currencyCodes={["INR", ...currencyRates.map(rate => rate.currencyCode).filter(code => code !== "INR")]} pendingIntent={pendingLifecycle} acquireMutation={kind => {
          if (!mounted.current || !canOrder || visibilityBusy || visibilityInFlight.current || visibilityUnknown || orderInFlight.current || orderAttempt.current || openOrderAttempt.current) return false;
          return acquireMutation(kind);
        }} releaseMutation={releaseMutation} onPendingChange={pending => { refreshMutation(value => value + 1); onPendingChange?.(pending); }} onChanged={reloadOrders} />
        {menuError && <p role="alert" className="mb-4 text-destructive">{uiText(menuError)} {uiText("Reload the page to reload the branch menu.")}</p>}
        {error && !open && <p role="alert" className="mb-4 text-destructive">{uiText(error)}</p>}
            {result && <div role="status" className="mt-3 space-y-3 rounded-md border p-3 text-sm">
              <p className="font-medium">{uiText("Order")} {result.order.orderNumber} {result.order.status === "OPEN" ? uiText("opened and sent to production.") : uiText("confirmed.")}</p>
              {result.tickets?.map(ticket => <div key={ticket.ticketNumber}><p className="font-medium">{ticket.ticketType} — {ticket.ticketNumber}</p><ul className="list-disc pl-5">{ticket.lines.map((line, i) => <li key={i}>{line.name} × {line.qty}</li>)}</ul></div>)}
              {!result.tickets?.length && !!result.kot.length && <div><p className="font-medium">{uiText("KOT (kitchen copy, no price)")}</p><ul className="list-disc pl-5">{result.kot.map((k, i) => <li key={i}>{k.name} × {k.qty}</li>)}</ul></div>}
              {result.receipt && <div><p className="font-medium">{uiText("Receipt")} {result.receipt.receiptNumber}</p><ul className="list-disc pl-5">{result.receipt.lines.map((l, i) => <li key={i}>{l.name} × {l.qty} = {formatInr(Number(l.lineTotal))}</li>)}</ul>
                <p>{uiText("Subtotal:")} {formatInr(Number(result.receipt.subtotal))}</p>
                <p>{uiText("VAT:")} {formatInr(Number(result.receipt.taxAmount))}{result.receipt.vat.rates.length ? " (" + result.receipt.vat.rates.map((r) => `${r.ratePercent}%: ${formatInr(Number(r.vatAmount))}`).join(", ") + ")" : ""}</p>
                <p className="font-medium">{uiText("Total:")} {formatInr(Number(result.receipt.totalAmount))}</p>
                {result.receipt.currency && <p className="text-sm">{uiText("Payable in")} {result.receipt.currency.tenderCurrencyCode}: <strong>{result.receipt.currency.tenderCurrencyAmount}</strong> ({uiText("rate")} TSh {result.receipt.currency.fxRateToInr})</p>}
              </div>}
              <p className="text-xs text-muted-foreground">{result.order.status === "PAID" && result.order.flow === "PRODUCTION_FIRST" ? uiText("No additional stock deducted at settlement; stock was already posted with the KOT/BOT tickets.") : result.order.status === "OPEN" ? <>{uiText("Inventory posted at ticket dispatch:")} {result.inventoryDeducted.map((d) => `${d.qtyDeducted}`).join(", ") || uiText("none (no BOM configured)")}</> : <>{uiText("Inventory deducted:")} {result.inventoryDeducted.map((d) => `${d.qtyDeducted}`).join(", ") || uiText("none (no BOM configured)")}</>}</p>
              {result.whatsapp?.attempted && <p className={result.whatsapp.sent ? "text-sm" : "text-sm text-destructive"}>{result.whatsapp.sent ? uiText("WhatsApp thank-you sent.", "WhatsApp Thank You bhej diya.") : uiText("WhatsApp thank-you was not sent:", "WhatsApp Thank You nahi bheja:") + " " + result.whatsapp.error}</p>}
            </div>}
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
        <Dialog open={!!openOrderTarget} onOpenChange={(value) => { if (!value && !busy && !openOrderAttempt.current) { setOpenOrderTarget(null); setOpenOrderLines([]); } }}>
          <DialogContent><DialogHeader><DialogTitle>{uiText(openOrderMode === "ADD" ? "Add items" : "Settle order")}</DialogTitle><DialogDescription>{uiText(openOrderMode === "ADD" ? "New lines validate and post their stock once, then dispatch fresh KOT/BOT tickets." : "Settlement records tender, creates the receipt and marks the already-posted order PAID without deducting stock again.")}</DialogDescription></DialogHeader>
            <p className="text-sm font-medium">{openOrderTarget?.orderNumber}</p>
            {pendingScopeMessage && <p role="alert">{uiText(pendingScopeMessage)}</p>}
            {openOrderTarget && openOrderTarget.branchId !== orderBranchId && <p role="alert">{uiText(`Select ${branches.find(branch => branch.id === openOrderTarget.branchId)?.name ?? openOrderTarget.branchId} as the explicit branch before updating this order. Its menu, shift and payment context must match.`)}</p>}
            {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
            <fieldset disabled={mutationLocked || !canOrder || openOrderTarget?.branchId !== orderBranchId}>
            {openOrderMode === "ADD" ? <div className="space-y-2">
              {openOrderLines.map((line, index) => <div key={index} className="flex gap-2"><select className={inputClass} value={line.menuItemId} onChange={event => setOpenOrderLines(current => current.map((row, i) => i === index ? { ...row, menuItemId: event.target.value } : row))}>{menuOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className={inputClass + " w-20"} type="number" min={1} max={500} value={line.qty} onChange={event => setOpenOrderLines(current => current.map((row, i) => i === index ? { ...row, qty: Math.max(1, Number(event.target.value) || 1) } : row))} /><Button variant="outline" onClick={() => setOpenOrderLines(current => current.filter((_, i) => i !== index))}>{uiText("Remove")}</Button></div>)}
              <Button variant="outline" disabled={!menuOptions.length} onClick={() => setOpenOrderLines(current => [...current, { menuItemId: menuOptions[0]?.id ?? "", qty: 1 }])}>{uiText("Add Item Line")}</Button>
            </div> : <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs"><span>{uiText("Tender")}</span><select className={inputClass} value={tenderType} onChange={event => setTenderType(event.target.value)}><option value="CASH">{uiText("Cash")}</option><option value="UPI">{uiText("UPI")}</option><option value="CARD">{uiText("Card")}</option></select></label><label className="space-y-1 text-xs"><span>{uiText("Payment currency")}</span><select className={inputClass} value={tenderCurrencyCode} onChange={event => setTenderCurrencyCode(event.target.value)}><option value="INR">{uiText("TZS (TSh)")}</option>{currencyRates.map(rate => <option key={rate.id} value={rate.currencyCode}>{rate.currencyCode}</option>)}</select></label></div>}
            </fieldset>
            <DialogFooter><Button variant="outline" disabled={busy || !!openOrderAttempt.current} onClick={() => { if (!orderInFlight.current && !openOrderAttempt.current) setOpenOrderTarget(null); }}>{uiText("Cancel")}</Button><Button disabled={busy || !canOrder || openOrderTarget?.branchId !== orderBranchId || (openOrderMode === "ADD" && !openOrderLines.length)} onClick={mutateOpenOrder}>{busy ? uiText("Saving…") : uiText(openOrderAttempt.current ? "Replay exact request" : openOrderMode === "ADD" ? "Add items" : "Settle order")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Card>
          <CardContent className="pt-5">
            {loading ? <p>{uiText("Loading today's orders…")}</p> : ordersError || visibilityUnknown ? <p>{uiText("Order list unavailable. Reload orders to verify current access.")}</p> : <Table>
              <TableHeader><TableRow><TableHead>{uiText("Order #")}</TableHead><TableHead>{uiText("Branch")}</TableHead><TableHead>{uiText("Channel")}</TableHead><TableHead>{uiText("Counter")}</TableHead><TableHead>{uiText("Table")}</TableHead><TableHead>{uiText("Amount")}</TableHead><TableHead>{uiText("Tender")}</TableHead><TableHead>{uiText("Time")}</TableHead><TableHead>{uiText("Status")}</TableHead><TableHead>{uiText("Actions")}</TableHead>{isOwner && <TableHead>{uiText("Visibility")}</TableHead>}</TableRow></TableHeader>
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
                  <TableCell>{o.status === "OPEN" && o.operatingConcept === "CONVENTIONAL" && o.channel === "DINE_IN" ? <div className="flex gap-1"><Button size="sm" variant="outline" disabled={mutationLocked || visibilityBusy || visibilityUnknown} onClick={() => beginOpenOrder(o, "ADD")}>{uiText("Add items")}</Button><Button size="sm" disabled={mutationLocked || visibilityBusy || visibilityUnknown} onClick={() => beginOpenOrder(o, "SETTLE")}>{uiText("Settle order")}</Button></div> : "—"}</TableCell>
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
