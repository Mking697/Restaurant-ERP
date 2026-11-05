"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { formatInr } from "@/lib/utils";
import { useShiftStatus, ShiftHandoverGate } from "@/lib/shift-gate";
import { MenuTilePicker } from "@/app/pos/menu-tile-picker";
import { PwaInstall } from "@/components/pwa-install";

interface MenuItemRow { id: string; branchId: string; name: string; price: string; category?: string; isActive: boolean; isSellable: boolean; imageUrl?: string | null; }
interface OrderRow { id: string; branchId: string; orderNumber: string; channel: string; operatingConcept: "FAST_FOOD" | "CONVENTIONAL"; tableNo: string; status: string; totalAmount: string; createdAt: string; }
interface SendResult { order: { orderNumber: string; tableNo?: string; status?: string }; tickets?: { ticketNumber: string; ticketType: "KOT" | "BOT"; lines: { name: string; qty: number }[] }[]; kot?: { name: string; qty: number }[]; }

const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
const newKey = () => `wtr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function WaiterPage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  return <WaiterScreen key={`${actor.id}:${selected}`} />;
}

function WaiterScreen() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches } = useBranches();
  const allowed = hasCurrentModule(actor, "POS_WAITER", "POS_CASHIER");
  const branchId = actor.role === "SUPER_ADMIN" ? (selected !== "all" ? selected : "") : actor.branchId ?? "";
  const branch = branches.find(b => b.id === branchId);
  const isConventional = branch?.operatingConcept === "CONVENTIONAL";
  const shiftStatus = useShiftStatus(branchId, allowed);

  const [menuOptions, setMenuOptions] = React.useState<MenuItemRow[]>([]);
  const [menuLoading, setMenuLoading] = React.useState(true);
  const [menuError, setMenuError] = React.useState("");
  const [openOrders, setOpenOrders] = React.useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(true);
  const [ordersError, setOrdersError] = React.useState("");
  const [targetOrderId, setTargetOrderId] = React.useState<string>(""); // "" = new table
  const [tableNo, setTableNo] = React.useState("");
  const [lines, setLines] = React.useState<{ menuItemId: string; qty: number }[]>([]);
  const [view, setView] = React.useState<"tiles" | "list">("tiles");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<SendResult | null>(null);
  const attempt = React.useRef<{ key: string; payload: Record<string, unknown>; targetOrderId: string; hadUnknown?: boolean } | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const reloadOpenOrders = React.useCallback(async () => {
    if (!allowed || !branchId || !isConventional) { setOpenOrders([]); setOrdersLoading(false); return; }
    setOrdersLoading(true); setOrdersError("");
    try {
      const data = await requestJson<{ orders: OrderRow[] }>(`/api/pos/orders?branchId=${encodeURIComponent(branchId)}`);
      if (!mounted.current) return;
      setOpenOrders(data.orders.filter(o => o.status === "OPEN" && o.channel === "DINE_IN"));
    } catch (err) { if (mounted.current) setOrdersError(err instanceof Error ? err.message : "Could not load open tables."); }
    finally { if (mounted.current) setOrdersLoading(false); }
  }, [allowed, branchId, isConventional]);
  React.useEffect(() => { void reloadOpenOrders(); }, [reloadOpenOrders]);

  React.useEffect(() => {
    let active = true;
    setMenuOptions([]); setMenuError("");
    if (!allowed || !branchId) { setMenuLoading(false); return; }
    setMenuLoading(true);
    requestJson<{ menuItems: MenuItemRow[] }>(`/api/menu-items?branchId=${encodeURIComponent(branchId)}`)
      .then(data => { if (active) setMenuOptions(data.menuItems.filter(m => m.isSellable && m.isActive)); })
      .catch(err => { if (active) setMenuError(err instanceof Error ? err.message : "Could not load branch menu."); })
      .finally(() => { if (active) setMenuLoading(false); });
    return () => { active = false; };
  }, [allowed, branchId]);

  const itemById = React.useMemo(() => new Map(menuOptions.map(m => [m.id, m])), [menuOptions]);
  const runningTotal = lines.reduce((sum, line) => sum + (Number(itemById.get(line.menuItemId)?.price ?? 0) * line.qty), 0);

  const canSend = allowed && !!branchId && isConventional && !menuLoading && !menuError && !ordersLoading && !ordersError && !shiftStatus.loading && !shiftStatus.error && !shiftStatus.pendingHandover && !busy && lines.length > 0 && (targetOrderId || tableNo.trim());

  async function send() {
    if (!mounted.current || !canSend && !attempt.current) return;
    setBusy(true); setError("");
    try {
      const isAdd = !!targetOrderId;
      const payload = attempt.current?.payload ?? (isAdd ? { lines, idempotencyKey: newKey() } : { branchId, channel: "DINE_IN", tableNo: tableNo.trim(), lines, idempotencyKey: newKey() });
      attempt.current ??= { key: String(payload.idempotencyKey), payload, targetOrderId };
      const url = isAdd ? `/api/pos/orders/${encodeURIComponent(targetOrderId)}/lines` : "/api/pos/orders";
      const data = await requestJson<SendResult>(url, { method: "POST", body: JSON.stringify(payload) });
      attempt.current = null;
      setResult({ order: { orderNumber: data.order.orderNumber, tableNo: isAdd ? openOrders.find(o => o.id === targetOrderId)?.tableNo : tableNo.trim(), status: data.order.status }, tickets: data.tickets, kot: data.kot });
      setLines([]); setTableNo(""); setTargetOrderId("");
      await reloadOpenOrders();
    } catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "rejected" && !attempt.current?.hadUnknown) attempt.current = null;
      else if (attempt.current) attempt.current.hadUnknown = true;
      setError(attempt.current ? uiText("Send outcome unknown. Replay the exact request below; do not send again.", "Send ka result pata nahi. Neeche wahi exact request replay karo; dobara mat bhejna.") : err instanceof Error ? err.message : "Send failed");
    } finally { setBusy(false); }
  }

  return <AppShell activeHref="/waiter">
    <PageHeader title={uiText("Waiter — Take Order", "Waiter — Order Lo")} description={uiText("Pick a table, add items, send straight to the kitchen. No payment here — the Cashier settles at POS.", "Table pakdo, items add karo, kitchen ko bhej do. Yahan payment nahi — Cashier POS par settle karega.")}>
      <PwaInstall scope="/waiter/" />
    </PageHeader>
    {!allowed ? <p role="alert">{uiText("Waiter or Cashier access is required.", "Waiter ya Cashier access chahiye.")}</p> : !branchId ? <p role="alert">{uiText("Select a branch first.", "Pehle branch select karo.")}</p> : !isConventional ? (
      <Card><CardContent className="pt-5"><p role="alert">{uiText("This branch is set up as Fast Food (counter service). Orders are taken directly at POS / Cashier — there is no separate waiter order-taking flow here.", "Ye branch Fast Food (counter service) hai. Order seedha POS / Cashier par liya jaata hai — yahan alag waiter flow nahi hai.")}</p></CardContent></Card>
    ) : <ShiftHandoverGate branchId={branchId} pendingHandover={shiftStatus.pendingHandover} loading={shiftStatus.loading} error={shiftStatus.error} onRetry={shiftStatus.reload} onAccepted={shiftStatus.reload}><>
      {error && <p role="alert" className="mb-3 text-destructive">{uiText(error)}</p>}
      {menuError && <p role="alert" className="mb-3 text-destructive">{uiText(menuError)}</p>}
      {ordersError && <p role="alert" className="mb-3 text-destructive">{uiText(ordersError)}</p>}
      {result && <Card className="mb-4"><CardContent className="pt-4 space-y-2">
        <p className="font-medium">{uiText("Sent to kitchen", "Kitchen ko bhej diya")} — {uiText("Order", "Order")} {result.order.orderNumber}{result.order.tableNo ? ` · ${uiText("Table", "Table")} ${result.order.tableNo}` : ""}</p>
        {result.tickets?.map(ticket => <div key={ticket.ticketNumber}><p className="text-sm font-medium">{ticket.ticketType} — {ticket.ticketNumber}</p><ul className="list-disc pl-5 text-sm">{ticket.lines.map((line, i) => <li key={i}>{line.name} × {line.qty}</li>)}</ul></div>)}
        {!result.tickets?.length && !!result.kot?.length && <ul className="list-disc pl-5 text-sm">{result.kot.map((k, i) => <li key={i}>{k.name} × {k.qty}</li>)}</ul>}
      </CardContent></Card>}

      <Card className="mb-4"><CardContent className="pt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs font-medium"><span>{uiText("Open table (add items)", "Khula table (items add karo)")}</span>
            <select className={inputClass} value={targetOrderId} disabled={busy || !!attempt.current} onChange={e => { setTargetOrderId(e.target.value); setLines([]); setResult(null); setError(""); }}>
              <option value="">{uiText("— New table —", "— Naya table —")}</option>
              {openOrders.map(o => <option key={o.id} value={o.id}>{uiText("Table", "Table")} {o.tableNo || o.orderNumber}</option>)}
            </select>
          </label>
          {!targetOrderId && <label className="block space-y-1 text-xs font-medium"><span>{uiText("Table no.", "Table no.")}</span>
            <input className={inputClass} value={tableNo} disabled={busy || !!attempt.current} onChange={e => setTableNo(e.target.value)} placeholder="T-12" />
          </label>}
        </div>
        <MenuTilePicker items={menuOptions} lines={lines} setLines={setLines} disabled={busy || !!attempt.current || !menuOptions.length} view={view} onViewChange={setView} />
        {!menuOptions.length && !menuLoading && <p className="text-xs text-muted-foreground">{uiText("No sellable menu items in this branch.", "Is branch mein koi sellable menu item nahi hai.")}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-sm">{uiText("Running total (tell the customer):", "Running total (customer ko batao):")} <strong>{formatInr(runningTotal)}</strong></p>
          <Button disabled={!canSend} onClick={send}>{busy ? uiText("Sending…", "Bheja ja raha hai…") : uiText(attempt.current ? "Replay exact request" : "Send to Kitchen", attempt.current ? "Replay exact request" : "Kitchen ko bhejo")}</Button>
        </div>
      </CardContent></Card>

      <p className="text-xs text-muted-foreground">{uiText("Open tables: ", "Khule tables: ")}{ordersLoading ? uiText("loading…", "load ho raha hai…") : openOrders.length}</p>
    </></ShiftHandoverGate>}
  </AppShell>;
}
