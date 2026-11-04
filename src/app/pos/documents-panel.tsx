"use client";
import * as React from "react";
import { requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import type { Document } from "@/lib/pos-documents";
import { PosDocumentPreview } from "@/components/pos-document-preview";

export type DocumentPending = { identity: string; branchId: string; sourceType: "DRAFT" | "ORDER"; sourceId: string; expectedRevision: number; body: string; hadUnknown?: boolean };
type Summary = Pick<Document, "id" | "branchId" | "kind" | "number" | "issuedAt" | "sourceType" | "sourceId" | "sourceRevision" | "orderId" | "proformaId" | "receiptNumber" | "totalAmount" | "currency">;
type Source = { id: string; branchId: string; revision: number; status: string; serviceStatus?: string; orderNumber?: string; payload?: { tableNo?: string } };
type Sources = { drafts: Source[]; orders: Source[]; capabilities: { canCashier: boolean }; visibilityScope: string; limit: number; truncated: boolean };
type Listing = { documents: Summary[]; visibilityScope: string; limit: number; truncated: boolean; legacyNotice: string };
type Props = { branchId: string; branchName: string; identity: string; allowed: boolean; canMutate: boolean; refreshToken?: number; pendingIntent: React.MutableRefObject<DocumentPending | null>; acquireMutation: (kind: "documents") => boolean; releaseMutation: (kind: "documents") => void; onPendingChange: (pending: boolean) => void; onChanged: () => Promise<unknown> };
const buttonClass = "rounded-md border px-3 py-2 text-sm disabled:opacity-50";
const positiveRevision = (value: number) => Number.isInteger(value) && value > 0;
const validSummary = (d: Summary) => !!d && typeof d.id === "string" && !!d.id && typeof d.branchId === "string" && !!d.branchId && ["PROFORMA", "FINAL"].includes(d.kind) && typeof d.number === "string" && !!d.number && ["DRAFT", "ORDER"].includes(d.sourceType) && typeof d.sourceId === "string" && !!d.sourceId && positiveRevision(d.sourceRevision) && typeof d.totalAmount === "string" && /^\d+(?:\.\d+)?$/.test(d.totalAmount) && d.currency?.baseCode === "TZS";

export function PosDocumentsPanel(props: Props) {
  const actor = useCurrentUser();
  const { identity, branchId, pendingIntent } = props;
  const context = JSON.stringify([identity, branchId, props.allowed, actor.id, actor.role, actor.branchId, actor.authenticated, actor.moduleAccess]);
  const live = React.useRef(context); live.current = context;
  const liveMutationAllowed = React.useRef(false); liveMutationAllowed.current = props.allowed && props.canMutate && actor.authenticated;
  const mounted = React.useRef(true), generation = React.useRef(0), inFlight = React.useRef(false), loaded = React.useRef("");
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [sources, setSources] = React.useState<Sources | null>(null);
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState("");
  const [selection, setSelection] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false), [documentId, setDocumentId] = React.useState<string | null>(null);
  const livePending = React.useRef(pendingIntent); livePending.current = pendingIntent;
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; if (livePending.current.current) livePending.current.current.hadUnknown = true; }; }, []);
  const current = () => mounted.current && live.current === context;
  const data = loaded.current === context ? listing : null;
  const sourceData = loaded.current === context ? sources : null;
  const pending = pendingIntent.current;
  const ownPending = pending?.identity === identity && pending.branchId === branchId;
  const scope = actor.role === "SUPER_ADMIN" ? "actual" : "access-filtered";
  const reload = React.useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError(""); setListing(null); setSources(null); setDocumentId(null);
    if (!props.allowed) { setLoading(false); return false; }
    const query = branchId ? `branchId=${encodeURIComponent(branchId)}` : "";
    try {
      const documents = await requestJson<Listing>(`/api/pos/documents?${query}`);
      const candidates = await requestJson<Sources>(`/api/pos/lifecycle?${query}${query ? "&" : ""}includeClosed=false`);
      if (!current() || version !== generation.current) return false;
      if (!Array.isArray(documents.documents) || documents.documents.some(d => !validSummary(d) || (!!branchId && d.branchId !== branchId)) || documents.visibilityScope !== scope || documents.limit !== 200 || documents.documents.length > documents.limit || typeof documents.truncated !== "boolean" || typeof documents.legacyNotice !== "string" || !Array.isArray(candidates.drafts) || !Array.isArray(candidates.orders) || candidates.visibilityScope !== scope || !Number.isInteger(candidates.limit) || candidates.limit < 1 || typeof candidates.truncated !== "boolean" || typeof candidates.capabilities?.canCashier !== "boolean") throw new Error("Unverified document/source response. Reload safely.");
      loaded.current = context; setListing(documents); setSources(candidates); return true;
    } catch (err) { if (current() && version === generation.current) setError(err instanceof Error ? err.message : "Could not load documents."); return false; }
    finally { if (current() && version === generation.current) setLoading(false); }
  }, [context, branchId, props.allowed, scope]);
  React.useEffect(() => { setSelection(""); setMessage(""); void reload(); return () => { generation.current++; }; }, [reload, props.refreshToken]);
  const candidates = sourceData ? [...sourceData.drafts.filter(s => s.status === "DRAFT").map(s => ({ ...s, type: "DRAFT" as const })), ...sourceData.orders.filter(s => s.status === "OPEN" && s.serviceStatus === "ACTIVE").map(s => ({ ...s, type: "ORDER" as const }))].filter(s => !!s.id && s.branchId === branchId && positiveRevision(s.revision)) : [];
  const target = candidates.find(s => `${s.type}:${s.id}` === selection);
  const ready = props.allowed && props.canMutate && !!branchId && !!sourceData?.capabilities.canCashier && !!data && !loading && !error;
  async function execute(intent: DocumentPending) {
    inFlight.current = true; setBusy(true); setMessage(""); props.onPendingChange(true);
    let saved: Document;
    try {
      const response = await requestJson<{ document: Document }>("/api/pos/documents/proforma", { method: "POST", body: intent.body });
      // Old authority must not clear the shared quarantine or release its lock.
      if (!current() || pendingIntent.current !== intent) { intent.hadUnknown = true; inFlight.current = false; return; }
      saved = response.document;
      if (!validSummary(saved) || saved.kind !== "PROFORMA" || saved.branchId !== intent.branchId || saved.sourceType !== intent.sourceType || saved.sourceId !== intent.sourceId || saved.sourceRevision !== intent.expectedRevision || !Array.isArray(saved.lines) || !saved.lines.length || !saved.seller || !saved.vat || typeof saved.disclaimer !== "string") throw new Error("Unverified proforma acknowledgment.");
    } catch (err) {
      if (!current() || pendingIntent.current !== intent) { intent.hadUnknown = true; inFlight.current = false; return; }
      if (err instanceof RequestJsonError && err.outcome === "rejected" && !intent.hadUnknown) { pendingIntent.current = null; props.releaseMutation("documents"); props.onPendingChange(false); }
      else intent.hadUnknown = true;
      if (current()) {
        setMessage(pendingIntent.current ? "Outcome unknown. Keep the frozen exact proforma request; do not issue a duplicate." : err instanceof Error ? err.message : "Proforma rejected.");
        if (err instanceof RequestJsonError && [401, 403, 404, 409].includes(err.status ?? 0)) await reload();
      }
      inFlight.current = false; if (current()) setBusy(false); return;
    }
    // A verified write is final, regardless of subsequent read/callback failures.
    pendingIntent.current = null;
    if (current()) {
      setMessage(`Proforma confirmed: ${saved.number}. Do not issue it again.`);
      try { const refreshed = await reload(); const parentRefreshed = await props.onChanged(); if (current()) { setDocumentId(saved.id); setMessage(refreshed && parentRefreshed !== false ? `Proforma confirmed: ${saved.number}. Saved snapshot available.` : `Proforma confirmed: ${saved.number}, but refresh failed. Reload history; do not issue again.`); } }
      catch { if (current()) setMessage(`Proforma confirmed: ${saved.number}, but refresh failed. Reload history; do not issue again.`); }
    }
    props.releaseMutation("documents"); props.onPendingChange(false);
    inFlight.current = false; if (current()) setBusy(false);
  }
  async function issue() {
    if (!current() || !liveMutationAllowed.current || !ready || !target || busy || inFlight.current || pendingIntent.current || !props.acquireMutation("documents")) return;
    const body = JSON.stringify({ sourceType: target.type, sourceId: target.id, expectedRevision: target.revision, requestKey: `pos-document-${Date.now()}-${Math.random().toString(36).slice(2)}` });
    const intent: DocumentPending = { identity, branchId, sourceType: target.type, sourceId: target.id, expectedRevision: target.revision, body };
    pendingIntent.current = intent; await execute(intent);
  }
  if (!props.allowed) return <p role="alert">POS / Cashier permission is required for financial documents.</p>;
  return <section aria-label="Internal sales documents" className="my-4 space-y-3 rounded-md border p-4">
    <h2 className="text-lg font-semibold">Proforma / Final document history</h2>
    <p className="font-semibold">INTERNAL SALES DOCUMENT — NOT A FISCAL RECEIPT</p>
    <p>Branch: {props.branchName || "All branches — select an explicit branch to issue"}. Seller TIN / VRN: unverified, not configured (null). No TRA/EFD integration.</p>
    <p>Issue/read/reprint posts no stock, COGS, revenue, tickets or payment. FINAL is created only with existing full payment; no separate final-issue action. Kitchen tickets print separately.</p>
    <button className={buttonClass} disabled={loading || busy} onClick={() => reload()}>Reload documents</button>
    {loading && <p role="status">Loading documents and authorized source revisions…</p>}
    {error && <p role="alert">{error}</p>}
    {loaded.current === context && message && <p role="status">{message}</p>}
    {pending && <p role="alert">{ownPending ? "Frozen proforma intent. Resolve its exact acknowledgment before another write." : "Unresolved document belongs to another authority or branch; all new mutations are quarantined."}</p>}
    {ownPending && <button className={buttonClass} disabled={busy || !props.canMutate} onClick={() => { const intent = pendingIntent.current; if (!current() || !liveMutationAllowed.current || inFlight.current || !intent || intent.identity !== identity || intent.branchId !== branchId || !props.acquireMutation("documents")) return; return execute(intent); }}>Replay exact proforma request</button>}
    {data && <><p>{data.visibilityScope === "actual" ? "Actual scope" : "Access-filtered scope, not actual branch totals"}. Document bound: {data.limit}. {data.truncated ? "Results truncated; narrow branch scope." : "No document truncation reported."} Source bound: {sourceData?.limit}. {sourceData?.truncated && "Source results truncated; not all eligible sources are shown."}</p><p>{data.legacyNotice || "Legacy missing snapshots are unavailable; history is not fabricated."}</p></>}
    <label>Persisted source / expected revision<select className="ml-2 rounded border p-2" disabled={!ready || busy || !!pending} value={selection} onChange={event => setSelection(event.target.value)}><option value="">Select a saved source</option>{candidates.map(s => <option key={`${s.type}:${s.id}`} value={`${s.type}:${s.id}`}>{s.type} {s.orderNumber || s.id} — revision {s.revision}{s.payload?.tableNo ? ` / table ${s.payload.tableNo}` : ""}</option>)}</select></label>
    <button className={buttonClass} disabled={!ready || !target || busy || !!pending} onClick={issue}>Issue proforma</button>
    {data && !candidates.length && <p>No eligible persisted DRAFT or unpaid ACTIVE/OPEN source in this explicit branch.</p>}
    {data?.documents.map(d => <article key={d.id} className="space-y-1 rounded border p-3"><h3>{d.number} — {d.kind}</h3><p>{d.issuedAt}; branch {d.branchId}; {d.sourceType} {d.sourceId} / revision {d.sourceRevision}. TZS {d.totalAmount}</p><p>Order: {d.orderId || "not linked"}; receipt: {d.receiptNumber || "none"}; applicable proforma: {d.proformaId || "none"}.</p><button className={buttonClass} onClick={() => { if (current()) setDocumentId(d.id); }}>View / print document</button></article>)}
    {data && !data.documents.length && <p>No saved documents in this scope. Legacy receipts may lack immutable snapshots; no historical document is invented.</p>}
    <PosDocumentPreview documentId={data ? documentId : null} onClose={() => setDocumentId(null)} />
  </section>;
}
