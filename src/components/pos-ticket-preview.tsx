"use client";
import * as React from "react";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";

export type TicketAction = "START" | "READY" | "SERVE";
export interface PosTicket {
  id: string; orderId: string; branchId: string; orderNumber: string; tableNo: string;
  station: "KITCHEN" | "BAR"; ticketNumber: string;
  status: "SENT" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  revision: number; createdAt: string; snapshotAvailable: boolean;
  lines: { orderLineId?: string; menuItemId: string; name: string; qty: number }[];
  history: { id: string; action: string; actorId: string; createdAt: string; revision: number; reason?: string; fromStatus?: string; toStatus?: string }[];
  allowedActions: TicketAction[];
}
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function ticketDocument(ticket: PosTicket) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Preparation ticket</title><style>body{font:16px monospace;padding:16px}li{margin:10px 0}</style></head><body><h1>${escapeHtml(ticket.ticketNumber)}</h1><p>${escapeHtml(ticket.station)} · ${escapeHtml(ticket.status)}</p><p>Order ${escapeHtml(ticket.orderNumber)} · Table ${escapeHtml(ticket.tableNo || "—")}</p><p>Branch ${escapeHtml(ticket.branchId)} · ${escapeHtml(ticket.createdAt)}</p><ul>${ticket.lines.map(line => `<li>${escapeHtml(line.qty)} × ${escapeHtml(line.name)}</li>`).join("")}</ul><p>Saved immutable preparation snapshot. Reprinting does not change stock or service state.</p></body></html>`;
}
export function PosTicketPreview({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const actor = useCurrentUser();
  const identity = JSON.stringify([actor.id, actor.role, actor.branchId, actor.ready, actor.authenticated, actor.moduleAccess]);
  if (!ticketId) return null;
  return <TicketPreview key={JSON.stringify([identity, ticketId])} ticketId={ticketId} onClose={onClose} />;
}
function TicketPreview({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const actor = useCurrentUser();
  const allowed = hasCurrentModule(actor, "POS_KITCHEN", "POS_CASHIER");
  const [ticket, setTicket] = React.useState<PosTicket | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [printDoc, setPrintDoc] = React.useState("");
  const [printSequence, setPrintSequence] = React.useState(0);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => {
    let active = true;
    setTicket(null); setError(""); setPrintDoc("");
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    requestJson<{ ticket: PosTicket }>(`/api/pos/tickets/${encodeURIComponent(ticketId)}`)
      .then(data => { if (active) { if (data.ticket?.id !== ticketId) throw new Error("Ticket acknowledgment did not match the requested snapshot."); setTicket(data.ticket); } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load ticket."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, ticketId, attempt]);
  return <section role="dialog" aria-modal="true" aria-label="Preparation ticket snapshot" className="fixed inset-0 z-50 overflow-auto bg-background p-6">
    <div className="mx-auto max-w-2xl space-y-4 rounded-lg border bg-card p-6">
      <h2 className="text-xl font-semibold">Preparation ticket snapshot</h2>
      <button type="button" onClick={onClose}>Close preview</button>
      {!allowed ? <p role="alert">Kitchen or cashier access is required.</p> : <>
        {loading && <p role="status">Loading ticket…</p>}
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={loading} onClick={() => { setTicket(null); setPrintDoc(""); setAttempt(n => n + 1); }}>Refresh snapshot</button>
        {!loading && !error && ticket && <>
          <h3>{ticket.ticketNumber} · {ticket.station} · {ticket.status}</h3>
          <p>Order {ticket.orderNumber} · Table {ticket.tableNo || "—"} · Branch {ticket.branchId}</p>
          <p>Created {ticket.createdAt} · Revision {ticket.revision}</p>
          {ticket.snapshotAvailable ? <ul>{ticket.lines.map((line, index) => <li key={line.orderLineId ?? index}>{line.qty} × {line.name}</li>)}</ul> : <p role="status">Legacy ticket: saved snapshot unavailable. Current catalog data is not substituted.</p>}
          <h3>Lifecycle history</h3>
          {ticket.history.length ? <ol>{ticket.history.map(event => <li key={event.id}>{event.createdAt} · {event.action} · {event.fromStatus ? `${event.fromStatus} → ` : ""}{event.toStatus} · Revision {event.revision}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol> : <p>No recorded lifecycle events.</p>}
          <button type="button" disabled={!ticket.snapshotAvailable} onClick={() => { if (ticket.snapshotAvailable) { setPrintDoc(ticketDocument(ticket)); setPrintSequence(n => n + 1); } }}>Print / reprint ticket</button>
          <p>Browser print of the saved ticket only. No stock or service changes. Physical printer/device delivery is not verified.</p>
        </>}
        {printDoc && <iframe key={printSequence} title="Ticket-only print document" style={{ position: "fixed", left: "-10000px", width: "1px", height: "1px", border: 0 }} srcDoc={printDoc} onLoad={event => { if (!mounted.current) return; const target = event.currentTarget.contentWindow; target?.focus(); target?.print(); }} />}
      </>}
    </div>
  </section>;
}
