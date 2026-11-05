"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PendingWorkWidget } from "@/components/pending-work-widget";
import { PosTicketPreview, type PosTicket, type TicketAction } from "@/components/pos-ticket-preview";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { useSelectedBranchId } from "@/lib/current-branch";
import { PwaInstall } from "@/components/pwa-install";

interface Queue { tickets: PosTicket[]; limit: number; truncated: boolean; capabilities: { canPrepare: boolean; canCashier: boolean; canCancel: boolean } }
interface Intent { ticketId: string; ticketNumber: string; branchId: string; action: TicketAction; expectedRevision: number; requestKey: string; hadUnknown?: boolean }
const actionLabel: Record<TicketAction, string> = { START: "Start preparation", READY: "Mark ready", SERVE: "Serve" };
const nextStatus: Record<TicketAction, PosTicket["status"]> = { START: "PREPARING", READY: "READY", SERVE: "SERVED" };
export default function KitchenPage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const identity = JSON.stringify([actor.id, actor.role, actor.branchId, actor.ready, actor.authenticated, actor.moduleAccess]);
  const scopeLock = React.useRef<{ identity: string; selected: string } | null>(null);
  const currentIdentity = React.useRef(identity);
  currentIdentity.current = identity;
  const [, updateScope] = React.useState(0);
  if (scopeLock.current && scopeLock.current.identity !== identity) scopeLock.current = null;
  const scope = scopeLock.current?.selected ?? selected;
  return <KitchenQueue key={JSON.stringify([identity, scope])} selected={scope} requestedSelection={selected} onPendingChange={pending => {
    if (currentIdentity.current !== identity) return;
    scopeLock.current = pending ? { identity, selected: scope } : null;
    updateScope(n => n + 1);
  }} />;
}
function KitchenQueue({ selected, requestedSelection, onPendingChange }: { selected: string; requestedSelection: string; onPendingChange: (pending: boolean) => void }) {
  const actor = useCurrentUser();
  const allowed = hasCurrentModule(actor, "POS_KITCHEN", "POS_CASHIER");
  const [station, setStation] = React.useState("ALL");
  const [includeServed, setIncludeServed] = React.useState(false);
  const [queue, setQueue] = React.useState<Queue | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<Intent | null>(null);
  const intent = React.useRef<Intent | null>(null);
  const inFlight = React.useRef(false);
  const locked = busy || !!pending;
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const version = React.useRef(0);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; version.current++; }; }, []);
  const reload = React.useCallback(async (afterMutation = false) => {
    if (!allowed || intent.current || (inFlight.current && !afterMutation)) return false;
    const request = ++version.current;
    setQueue(null); setPreviewId(null); setLoading(true); setError("");
    const query = new URLSearchParams({ station, includeServed: String(includeServed) });
    if (selected !== "all") query.set("branchId", selected);
    try {
      const data = await requestJson<Queue>(`/api/pos/kitchen?${query}`);
      if (!mounted.current || request !== version.current) return false;
      if (!Array.isArray(data.tickets) || !Number.isInteger(data.limit) || data.limit < 1 || typeof data.truncated !== "boolean" || typeof data.capabilities?.canPrepare !== "boolean" || typeof data.capabilities?.canCashier !== "boolean") throw new Error("Could not verify kitchen queue bounds and capabilities.");
      setQueue(data); return true;
    } catch (err) {
      if (mounted.current && request === version.current) setError(err instanceof Error ? err.message : "Could not load kitchen queue.");
      return false;
    } finally { if (mounted.current && request === version.current) setLoading(false); }
  }, [allowed, station, includeServed, selected]);
  React.useEffect(() => { void reload(); return () => { version.current++; }; }, [reload]);
  function canAct(ticket: PosTicket, action: TicketAction) {
    if (!allowed || !queue || loading || error || !ticket.allowedActions.includes(action)) return false;
    if (action === "SERVE") return ticket.status === "READY" && queue.capabilities.canCashier && hasCurrentModule(actor, "POS_CASHIER");
    return ticket.status === (action === "START" ? "SENT" : "PREPARING") && queue.capabilities.canPrepare && hasCurrentModule(actor, "POS_KITCHEN");
  }
  async function perform(ticket?: PosTicket, action?: TicketAction) {
    if (!mounted.current || !allowed || inFlight.current) return;
    if (ticket) {
      if (!action || intent.current || !canAct(ticket, action)) return;
      intent.current = { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, branchId: ticket.branchId, action, expectedRevision: ticket.revision, requestKey: `ticket-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    }
    const attempt = intent.current;
    if (!attempt) return;
    // Freeze exact intent and guard duplicate clicks before the first await.
    inFlight.current = true; setBusy(true); setPending(attempt); onPendingChange(true); setMessage(""); setPreviewId(null);
    try {
      const data = await requestJson<{ ticket: PosTicket }>(`/api/pos/tickets/${encodeURIComponent(attempt.ticketId)}/action`, { method: "POST", body: JSON.stringify({ action: attempt.action, expectedRevision: attempt.expectedRevision, requestKey: attempt.requestKey }) });
      if (!mounted.current) return;
      if (data.ticket?.id !== attempt.ticketId || data.ticket.branchId !== attempt.branchId || data.ticket.revision !== attempt.expectedRevision + 1 || data.ticket.status !== nextStatus[attempt.action]) throw new Error("Unverified ticket action acknowledgment.");
      intent.current = null; setPending(null);
      setMessage("Action confirmed. Reloading preparation queue…");
      const refreshed = await reload(true);
      if (!mounted.current) return;
      setMessage(refreshed ? "Action confirmed. Queue refreshed." : "Action confirmed. Queue reload failed; use Refresh. Do not submit the action again.");
      onPendingChange(false);
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof RequestJsonError && err.outcome === "rejected" && !attempt.hadUnknown) {
        intent.current = null; setPending(null); onPendingChange(false);
        setMessage(`Action rejected: ${err.message}`);
      } else {
        attempt.hadUnknown = true;
        setMessage("Action outcome unknown. It may already be saved. Replay only the exact request below; conflicting actions and filters are locked.");
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <AppShell activeHref="/kitchen">
    <div className="space-y-5">
      <header><h1 className="text-2xl font-semibold">Kitchen / bar preparation</h1><p className="text-sm text-muted-foreground">Saved preparation tickets only. Financial and preparation status are separate.</p><div className="pt-2"><PwaInstall scope="/kitchen/" /></div></header>
      <PendingWorkWidget />
      {!allowed ? <p role="alert">Kitchen or cashier access is required.</p> : <>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
          <label>Station <select value={station} disabled={locked} onChange={event => { if (intent.current || inFlight.current) return; setQueue(null); setPreviewId(null); setStation(event.target.value); }} className="rounded border bg-background p-2"><option value="ALL">All stations</option><option value="KITCHEN">Kitchen</option><option value="BAR">Bar</option></select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeServed} disabled={locked} onChange={event => { if (intent.current || inFlight.current) return; setQueue(null); setPreviewId(null); setIncludeServed(event.target.checked); }} />Include served / cancelled history</label>
          <button type="button" disabled={loading || locked} onClick={() => { void reload(); }}>Refresh</button>
          <p>Branch scope: {selected === "all" ? "All authorized branches" : selected}</p>
        </div>
        {requestedSelection !== selected && <p role="alert">Pending action remains in branch scope {selected}. Resolve the exact request before switching to {requestedSelection}.</p>}
        {message && <p role="status">{message}</p>}
        {pending && <div className="space-y-2 rounded-lg border p-4"><p>Pending {pending.action} · {pending.ticketNumber} · Branch {pending.branchId} · Revision {pending.expectedRevision}</p><p className="break-all text-sm">Request key: {pending.requestKey}</p><button type="button" disabled={busy} onClick={() => perform()}>Replay exact request</button></div>}
        {loading && <p role="status">Loading preparation queue…</p>}
        {error && <p role="alert">{error} Use Refresh to retry loading.</p>}
        {queue && <>
          <p className="text-sm text-muted-foreground">{queue.tickets.length} returned · Limit {queue.limit}. Station, history and branch filters are applied by the server before the limit. Unresolved overnight work remains included. {queue.truncated ? "Results truncated: more matching tickets exist. Narrow branch or station and refresh." : "Not truncated."}</p>
          {!queue.tickets.length && <p role="status">No tickets match these filters.</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{queue.tickets.map(ticket => <article key={ticket.id} className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{ticket.ticketNumber} · {ticket.station}</h2>
            <p>{ticket.status} · Revision {ticket.revision}</p>
            <p>Order {ticket.orderNumber} · Table {ticket.tableNo || "—"} · Branch {ticket.branchId}</p>
            <p className="text-sm">{ticket.createdAt}</p>
            {ticket.snapshotAvailable ? <ul className="space-y-1">{ticket.lines.map((line, index) => <li key={line.orderLineId ?? index}>{line.qty} × {line.name}</li>)}</ul> : <p>Legacy ticket: saved snapshot unavailable.</p>}
            <div className="flex flex-wrap gap-3">{(["START", "READY", "SERVE"] as TicketAction[]).filter(action => canAct(ticket, action)).map(action => <button type="button" key={action} disabled={locked} onClick={() => perform(ticket, action)}>{actionLabel[action]}</button>)}
              <button type="button" disabled={locked} onClick={() => { if (!intent.current && !inFlight.current) setPreviewId(ticket.id); }}>Snapshot / history / print</button>
            </div>
          </article>)}</div>
        </>}
        <PosTicketPreview ticketId={previewId} onClose={() => setPreviewId(null)} />
      </>}
    </div>
  </AppShell>;
}
