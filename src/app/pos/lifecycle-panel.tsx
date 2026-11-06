"use client";
import * as React from "react";
import { requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { PosTicketPreview } from "@/components/pos-ticket-preview";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type DraftPayload = { channel: string; tableNo?: string; counterNo?: string; customerPhone?: string; customerName?: string; tenderType?: string; tenderCurrencyCode?: string; lines: { menuItemId: string; qty: number }[] };
type Draft = { id: string; branchId: string; status: string; revision: number; payload: DraftPayload; orderId: string | null };
type Event = { id: string; action: string; actorId: string; createdAt: string; revision: number; reason?: string };
type Ticket = { id: string; branchId: string; status: string; revision: number; ticketNumber: string; allowedActions: string[] };
type LifecycleOrder = { id: string; branchId: string; orderNumber: string; tableNo: string; channel: string; operatingConcept: string; status: string; serviceStatus: string; revision: number; tickets: Ticket[]; history: Event[] };
type LifecycleData = { drafts: Draft[]; orders: LifecycleOrder[]; visibilityScope: "actual" | "access-filtered"; limit: number; truncated: boolean; capabilities: { canCashier: boolean; canCancel: boolean; canPrepare: boolean } };
export type LifecyclePending = { identity: string; branchId: string; entityId: string; action: string; url: string; method: string; body: string; hadUnknown?: boolean };
type MenuOption = { id: string; branchId: string; name: string; isActive: boolean; isSellable: boolean };
type Props = {
  refreshToken?: number;
  branchId: string; branchName: string; operatingConcept: string; identity: string; allowed: boolean; canMutate: boolean;
  menuOptions: MenuOption[]; menuLoading: boolean; menuError: string; currencyCodes: string[];
  pendingIntent: React.MutableRefObject<LifecyclePending | null>;
  acquireMutation: (kind: "lifecycle") => boolean; releaseMutation: (kind: "lifecycle") => void;
  onPendingChange: (pending: boolean) => void; onChanged: () => Promise<unknown>;
};
const inputClass = "w-full rounded-md border bg-card px-3 py-2 text-sm";
const buttonClass = "rounded-md border px-3 py-2 text-sm disabled:opacity-50";
const freshPayload = (): DraftPayload => ({ channel: "DINE_IN", tableNo: "", counterNo: "COUNTER_1", lines: [] });

export function PosLifecyclePanel(props: Props) {
  const actor = useCurrentUser();
  const owner = actor.role === "SUPER_ADMIN";
  const { branchId, identity, pendingIntent } = props;
  const context = JSON.stringify([identity, branchId, props.allowed]);
  const liveContext = React.useRef(context);
  liveContext.current = context;
  const loadedContext = React.useRef("");
  const [loadedData, setData] = React.useState<LifecycleData | null>(null);
  const data = loadedContext.current === context ? loadedData : null;
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [includeClosed, setIncludeClosed] = React.useState(false);
  const [editing, setEditing] = React.useState<Draft | "NEW" | null>(null);
  const [payload, setPayload] = React.useState<DraftPayload>(freshPayload);
  const [busy, setBusy] = React.useState(false);
  const [ticketId, setTicketId] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState<{ kind: "DRAFT" | "ORDER"; id: string; branchId: string; revision: number } | null>(null);
  const [reason, setReason] = React.useState("");
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);
  const generation = React.useRef(0);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const menu = props.menuOptions.filter(item => item.branchId === branchId && item.isActive && item.isSellable);
  const pending = pendingIntent.current;
  const ownPending = pending?.identity === identity && pending.branchId === branchId;
  const frozen = busy || !!pending;
  const ready = props.allowed && props.canMutate && !!branchId && !!data?.capabilities.canCashier && !loading && !error;
  const reload = React.useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setData(null); setError(""); setTicketId(null); setEditing(null); setCancelling(null); setReason("");
    if (!props.allowed) { setLoading(false); return false; }
    try {
      const result = await requestJson<LifecycleData>(`/api/pos/lifecycle?${branchId ? `branchId=${encodeURIComponent(branchId)}&` : ""}includeClosed=${includeClosed}`);
      if (!mounted.current || liveContext.current !== context || version !== generation.current) return false;
      if (!Array.isArray(result.drafts) || !Array.isArray(result.orders) || !Number.isInteger(result.limit) || result.limit < 1 || typeof result.truncated !== "boolean" || !result.capabilities || typeof result.capabilities.canCashier !== "boolean" || typeof result.capabilities.canCancel !== "boolean" || result.visibilityScope !== (owner ? "actual" : "access-filtered")) throw new Error("Unverified lifecycle response. Reload safely.");
      loadedContext.current = context;
      setData(result);
      return true;
    } catch (err) { if (mounted.current && liveContext.current === context && version === generation.current) setError(err instanceof Error ? err.message : "Could not load lifecycle."); return false; }
    finally { if (mounted.current && liveContext.current === context && version === generation.current) setLoading(false); }
  }, [branchId, includeClosed, props.allowed, context, owner]);
  React.useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload, props.refreshToken]);

  async function mutate(entityId: string, action: string, url: string, method: string, body: Record<string, unknown>) {
    if (!mounted.current || liveContext.current !== context || !ready || frozen || inFlight.current || pendingIntent.current || !props.acquireMutation("lifecycle")) return;
    const intent: LifecyclePending = { identity, branchId, entityId, action, url, method, body: JSON.stringify({ ...body, requestKey: `pos-life-${Date.now()}-${Math.random().toString(36).slice(2)}` }) };
    pendingIntent.current = intent;
    await execute(intent);
  }
  async function execute(intent: LifecyclePending) {
    inFlight.current = true; setBusy(true); setMessage(""); props.onPendingChange(true);
    try {
      const result = await requestJson<{ draft?: Draft; ticket?: Ticket; order?: LifecycleOrder }>(intent.url, { method: intent.method, body: intent.body });
      if (!mounted.current || liveContext.current !== context || pendingIntent.current !== intent) { intent.hadUnknown = true; return; }
      const entity = intent.action.endsWith("DRAFT") ? result.draft : intent.action === "SERVE" ? result.ticket : result.order;
      const expectedRevision = JSON.parse(intent.body).expectedRevision ?? 0;
      const expectedStatus: Record<string, string> = { CREATE_DRAFT: "DRAFT", EDIT_DRAFT: "DRAFT", DISPATCH_DRAFT: "DISPATCHED", CANCEL_DRAFT: "CANCELLED", SERVE: "SERVED", CANCEL: "VOIDED" };
      if (!entity?.id || (intent.entityId !== "NEW" && entity.id !== intent.entityId) || entity.branchId !== intent.branchId || !Number.isInteger(entity.revision) || entity.revision <= expectedRevision || (intent.action === "CLOSE" ? result.order?.serviceStatus !== "CLOSED" : entity.status !== expectedStatus[intent.action])) throw new Error("Unverified lifecycle acknowledgment.");
      pendingIntent.current = null;
      if (!mounted.current || liveContext.current !== context) return;
      setMessage("Action confirmed. Reloading current work; do not submit it again.");
      // Refresh failures cannot change the already verified write outcome.
      try {
        const refreshed = await reload();
        const parentRefreshed = await props.onChanged();
        if (mounted.current && liveContext.current === context) setMessage(refreshed && parentRefreshed !== false ? "Action confirmed. Current work refreshed." : "Action confirmed, but refresh failed. Reload current work; do not submit the action again.");
      } catch {
        if (mounted.current && liveContext.current === context) setMessage("Action confirmed, but refresh failed. Reload current work; do not submit the action again.");
      }
    } catch (err) {
      if (!mounted.current || liveContext.current !== context || pendingIntent.current !== intent) { intent.hadUnknown = true; return; }
      if (err instanceof RequestJsonError && err.outcome === "rejected" && !intent.hadUnknown) { pendingIntent.current = null; props.releaseMutation("lifecycle"); props.onPendingChange(false); }
      else intent.hadUnknown = true;
      if (mounted.current && liveContext.current === context) {
        setMessage(pendingIntent.current ? "Outcome unknown. Replay the exact lifecycle request; never create a duplicate." : err instanceof Error ? err.message : "Action rejected.");
        if (err instanceof RequestJsonError && [401, 403, 404, 409].includes(err.status ?? 0)) await reload();
      }
    } finally { if (!pendingIntent.current) { props.releaseMutation("lifecycle"); props.onPendingChange(false); } inFlight.current = false; if (mounted.current && liveContext.current === context) setBusy(false); }
  }
  async function saveDraft() {
    if (!editing || props.menuLoading || props.menuError || !payload.lines.length || payload.lines.some(line => !menu.some(item => item.id === line.menuItemId) || !Number.isInteger(line.qty) || line.qty < 1 || line.qty > 500)) return;
    const create = editing === "NEW";
    await mutate(create ? "NEW" : editing.id, create ? "CREATE_DRAFT" : "EDIT_DRAFT", create ? "/api/pos/drafts" : `/api/pos/drafts/${encodeURIComponent(editing.id)}`, create ? "POST" : "PATCH", create ? { branchId, payload } : { payload, expectedRevision: editing.revision });
  }
  function beginCancellation(target: { id: string; branchId: string; revision: number }, kind: "DRAFT" | "ORDER") {
    if (!ready || frozen || target.branchId !== branchId || (kind === "ORDER" && !data?.capabilities.canCancel)) return;
    setCancelling({ ...target, kind }); setReason("");
  }
  async function cancel() {
    if (!cancelling || cancelling.branchId !== branchId || reason.trim().length < 3 || reason.trim().length > 500 || (cancelling.kind === "ORDER" && !data?.capabilities.canCancel)) return;
    await mutate(cancelling.id, cancelling.kind === "DRAFT" ? "CANCEL_DRAFT" : "CANCEL", cancelling.kind === "DRAFT" ? `/api/pos/drafts/${encodeURIComponent(cancelling.id)}/cancel` : `/api/pos/orders/${encodeURIComponent(cancelling.id)}/lifecycle`, "POST", { expectedRevision: cancelling.revision, reason: reason.trim(), ...(cancelling.kind === "ORDER" ? { action: "CANCEL" } : {}) });
  }

  if (!props.allowed) return <p role="alert">POS / Cashier permission is required.</p>;
  return <section aria-label="Draft and table lifecycle" className="my-4 space-y-3 rounded-md border p-4">
    <h2 className="text-lg font-semibold">Drafts / Tables / Service</h2>
    <p>Branch: {props.branchName || "All branches — select an explicit branch to mutate"}. Concept: {branchId ? props.operatingConcept : "target order snapshot"}.</p>
    <p className="text-sm">Drafts do not deduct stock, COGS or revenue and create no tickets or receipts. Dispatch validates current stock and sellability. FAST_FOOD and non-dine-in are payment-first; only CONVENTIONAL dine-in opens unpaid.</p>
    <label><input type="checkbox" checked={includeClosed} disabled={frozen} onChange={event => setIncludeClosed(event.target.checked)} /> Include closed / cancelled history</label>
    <button className={buttonClass} disabled={loading || busy} onClick={() => void reload()}>Reload lifecycle</button>
    {loading && <p role="status">Loading drafts and service work…</p>}
    {error && <p role="alert">{error} Reload lifecycle before trying again.</p>}
    {loadedContext.current === context && message && <p role="status">{message}</p>}
    {pending && <p role="alert">{ownPending ? "Outcome unknown. Frozen exact request; do not create a duplicate." : "An unresolved mutation belongs to a different authority or branch. Return to its original context; no new mutation is allowed."}</p>}
    {ownPending && <button className={buttonClass} disabled={busy || !props.allowed || !props.canMutate} onClick={() => { const intent = pendingIntent.current; if (!mounted.current || liveContext.current !== context || inFlight.current || !intent || intent.identity !== identity || intent.branchId !== branchId || !props.allowed || !props.canMutate || !props.acquireMutation("lifecycle")) return; return execute(intent); }}>Replay exact lifecycle request</button>}
    {data && <p className="text-sm">{data.visibilityScope === "actual" ? "Actual scope" : "Access-filtered, not actual branch totals"}. Backend bound: {data.limit}. {data.truncated ? "Results truncated; narrow the branch scope." : "No truncation reported."}</p>}
    <button className={buttonClass} disabled={!ready || frozen || props.menuLoading || !!props.menuError || !menu.length} onClick={() => { if (!ready || frozen) return; setEditing("NEW"); setPayload({ ...freshPayload(), lines: menu[0] ? [{ menuItemId: menu[0].id, qty: 1 }] : [] }); }}>New draft</button>
    {props.menuLoading && <p>Loading branch menu…</p>}{props.menuError && <p role="alert">{props.menuError}</p>}
    {!props.menuLoading && branchId && !menu.length && <p>No same-branch sellable menu items.</p>}
    {data && editing && <div className="space-y-3 rounded border p-3"><h3>{editing === "NEW" ? "New draft" : `Edit draft ${editing.id} (revision ${editing.revision})`}</h3>
      <fieldset disabled={frozen || !ready} className="space-y-2">
        <label>Channel<Select value={payload.channel} onChange={event => setPayload({ ...payload, channel: event.target.value })}>{["DINE_IN", "TAKEAWAY", "SWIGGY", "ZOMATO"].map(value => <option key={value}>{value}</option>)}</Select></label>
        <label>Table<Input value={payload.tableNo ?? ""} onChange={event => setPayload({ ...payload, tableNo: event.target.value })} /></label>
        <label>Counter<Select value={payload.counterNo ?? "COUNTER_1"} onChange={event => setPayload({ ...payload, counterNo: event.target.value })}>{["COUNTER_1", "COUNTER_2"].map(value => <option key={value}>{value}</option>)}</Select></label>
        <label>Tender (optional until dispatch)<Select value={payload.tenderType ?? ""} onChange={event => setPayload({ ...payload, tenderType: event.target.value || undefined })}><option value="">Not recorded</option>{["CASH", "UPI", "CREDIT_CARD", "DEBIT_CARD"].map(value => <option key={value}>{value}</option>)}</Select></label>
        <label>Tender currency<Select value={payload.tenderCurrencyCode ?? "INR"} onChange={event => setPayload({ ...payload, tenderCurrencyCode: event.target.value })}>{props.currencyCodes.map(value => <option key={value} value={value}>{value === "INR" ? "TZS (TSh)" : value}</option>)}</Select></label>
        {payload.lines.map((line, index) => <div key={index} className="flex gap-2"><label>Item<Select value={line.menuItemId} onChange={event => setPayload({ ...payload, lines: payload.lines.map((row, i) => i === index ? { ...row, menuItemId: event.target.value } : row) })}>{!menu.some(item => item.id === line.menuItemId) && <option value={line.menuItemId}>Unavailable item — replace before save</option>}{menu.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label><label>Quantity<Input type="number" min={1} max={500} value={line.qty} onChange={event => setPayload({ ...payload, lines: payload.lines.map((row, i) => i === index ? { ...row, qty: Number(event.target.value) } : row) })} /></label><button className={buttonClass} onClick={() => setPayload({ ...payload, lines: payload.lines.filter((_, i) => i !== index) })}>Remove draft line</button></div>)}
        <button className={buttonClass} disabled={!menu.length} onClick={() => setPayload({ ...payload, lines: [...payload.lines, { menuItemId: menu[0]?.id ?? "", qty: 1 }] })}>Add draft line</button>
      </fieldset>
      <button className={buttonClass} disabled={frozen || !ready || !payload.lines.length} onClick={saveDraft}>Save draft</button>
      <button className={buttonClass} disabled={frozen} onClick={() => setEditing(null)}>Dismiss editor</button>
    </div>}
    {data?.drafts.map(draft => <article key={draft.id} className="space-y-2 rounded border p-3">
      <h3>Draft {draft.id} — {draft.status} / revision {draft.revision}</h3><p>Branch {draft.branchId}; {draft.payload.channel}; table {draft.payload.tableNo || "—"}{draft.orderId ? `; dispatched order ${draft.orderId}` : ""}</p>
      {draft.status === "DRAFT" && <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={!ready || frozen || draft.branchId !== branchId} onClick={() => { if (!ready || frozen || draft.branchId !== branchId) return; setEditing(draft); setPayload(JSON.parse(JSON.stringify(draft.payload))); }}>Edit draft</button>
        <button className={buttonClass} disabled={!ready || frozen || draft.branchId !== branchId} onClick={() => { if (draft.branchId !== branchId) return; return mutate(draft.id, "DISPATCH_DRAFT", `/api/pos/drafts/${encodeURIComponent(draft.id)}/dispatch`, "POST", { expectedRevision: draft.revision }); }}>Dispatch draft</button>
        <button className={buttonClass} disabled={!ready || frozen || draft.branchId !== branchId} onClick={() => beginCancellation(draft, "DRAFT")}>Cancel draft</button>
        <p className="text-sm">Dispatch admits immutable lines and posts stock once. Payment-first branches/channels record the draft tender before admission; absent tender is rejected by the server. Extra items after dispatch use Add items, not draft edits.</p>
      </div>}
    </article>)}
    {data?.orders.map(order => {
      const active = order.serviceStatus === "ACTIVE" && order.status !== "VOIDED";
      const allServed = order.tickets.filter(ticket => ticket.status !== "CANCELLED").every(ticket => ticket.status === "SERVED");
      const canClose = active && order.status === "PAID" && order.tickets.length > 0 && allServed;
      const targetMatches = order.branchId === branchId;
      return <article key={order.id} className="space-y-2 rounded border p-3">
        <h3 className="font-semibold">{order.orderNumber} — Table {order.tableNo || "—"}</h3>
        <p>Branch {order.branchId}; target concept {order.operatingConcept}; {order.channel}; revision {order.revision}.</p>
        <p>Financial: {order.status}. Service: {order.serviceStatus}.</p>
        {!targetMatches && <p>Select this order’s explicit branch before service actions. Target concept and version come from the saved order, not today’s branch settings.</p>}
        {order.tickets.map(ticket => <div key={ticket.id} className="flex flex-wrap items-center gap-2"><span>{ticket.ticketNumber}: {ticket.status} (revision {ticket.revision})</span>
          <button className={buttonClass} onClick={() => setTicketId(ticket.id)}>View / reprint ticket</button>
          {ticket.status === "READY" && ticket.allowedActions.includes("SERVE") && active && <button className={buttonClass} disabled={!ready || frozen || !targetMatches || ticket.branchId !== branchId} onClick={() => { if (!targetMatches || ticket.branchId !== branchId) return; return mutate(ticket.id, "SERVE", `/api/pos/tickets/${encodeURIComponent(ticket.id)}/action`, "POST", { action: "SERVE", expectedRevision: ticket.revision }); }}>Mark served</button>}
        </div>)}
        {!order.tickets.length && <p>No saved tickets; legacy snapshots cannot be fabricated.</p>}
        <button className={buttonClass} disabled={!ready || frozen || !targetMatches || !canClose} onClick={() => { if (!targetMatches || !canClose) return; return mutate(order.id, "CLOSE", `/api/pos/orders/${encodeURIComponent(order.id)}/lifecycle`, "POST", { action: "CLOSE", expectedRevision: order.revision }); }}>Close service</button>
        {!canClose && active && <p>Close only after full payment and every noncancelled ticket is SERVED. Use existing Settle order for payment; paid does not mean served.</p>}
        {active && order.status === "OPEN" && data.capabilities.canCancel && <button className={buttonClass} disabled={!ready || frozen || !targetMatches} onClick={() => beginCancellation(order, "ORDER")}>Cancel unpaid order</button>}
        {order.status === "PAID" && <p>Paid-order cancellation/refund is outside this flow (GAP-027).</p>}
        <details><summary>Lifecycle history</summary>{order.history.length ? <ul>{order.history.map(event => <li key={event.id}>{event.createdAt} — {event.action}; actor {event.actorId}; revision {event.revision}{event.reason ? `; ${event.reason}` : ""}</li>)}</ul> : <p>No saved lifecycle events.</p>}</details>
      </article>;
    })}
    {data && cancelling && <div className="space-y-2 rounded border p-3">
      <h3>Cancel {cancelling.kind.toLowerCase()} {cancelling.id} / revision {cancelling.revision}</h3>
      <p role="alert">{cancelling.kind === "ORDER" ? "This preserves original lines, amounts, costs and history, cancels tickets and marks the unpaid order VOIDED/CANCELLED: no restock and no automatic refund." : "Cancel only this persisted draft. No stock, COGS, revenue, tickets or receipts were posted."}</p>
      <label>Cancellation reason (3–500 characters)<textarea className={inputClass} minLength={3} maxLength={500} disabled={frozen || !ready} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button className={buttonClass} disabled={frozen || !ready || reason.trim().length < 3 || reason.trim().length > 500} onClick={cancel}>Confirm cancellation</button>
      <button className={buttonClass} disabled={frozen} onClick={() => setCancelling(null)}>Dismiss cancellation</button>
    </div>}
    {data && !data.drafts.length && !data.orders.length && <p>No draft or service work in this scope.</p>}
    <PosTicketPreview ticketId={data ? ticketId : null} onClose={() => setTicketId(null)} />
  </section>;
}
