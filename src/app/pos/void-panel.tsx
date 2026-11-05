"use client";
import * as React from "react";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import type { PaymentOrderSummary } from "@/lib/pos-payments";
import type { OrderReversal } from "@/lib/pos-order-reversals";

type Listing = { orders: PaymentOrderSummary[]; visibilityScope: "actual" | "access-filtered"; limit: number; truncated: boolean; legacyNotice: string };
type VoidAck = { order: { id: string; status: "VOIDED" }; reversal: OrderReversal; replayed?: boolean };
type Props = { branchId: string; branchName: string; identity: string; allowed: boolean; refreshToken?: number; onVoided?: () => void };
const buttonClass = "rounded-md border px-3 py-2 text-sm disabled:opacity-50";
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function validReversal(reversal: OrderReversal, orderId: string): boolean {
  return !!reversal && nonempty(reversal.id) && reversal.orderId === orderId && nonempty(reversal.branchId) && nonempty(reversal.reason) &&
    nonempty(reversal.actorId) && nonempty(reversal.actorName) && ["PAID", "COMPLETED"].includes(reversal.priorStatus) &&
    Array.isArray(reversal.restockedLines) && Array.isArray(reversal.wastedLines) && typeof reversal.createdAt === "string" && Number.isFinite(Date.parse(reversal.createdAt));
}

export function PosVoidPanel(props: Props) {
  const actor = useCurrentUser();
  const allowed = props.allowed && actor.authenticated && hasCurrentModule(actor, "POS_CASHIER");
  const canVoid = allowed && (actor.role === "SUPER_ADMIN" || (actor.role === "BRANCH_MANAGER" && hasCurrentModule(actor, "POS_CASHIER")));
  const context = JSON.stringify([props.identity, props.branchId, allowed, actor.id, actor.role, actor.branchId, actor.moduleAccess, props.refreshToken]);
  const live = React.useRef(context); live.current = context;
  const mounted = React.useRef(true), generation = React.useRef(0);
  const [loaded, setLoaded] = React.useState<{ context: string; data: Listing } | null>(null);
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState("");
  const [voidTargetId, setVoidTargetId] = React.useState<string | null>(null);
  const [voidReasonText, setVoidReasonText] = React.useState("");
  const voidAttempt = React.useRef<{ orderId: string; reason: string; hadUnknown?: boolean } | null>(null);
  const [voidBusy, setVoidBusy] = React.useState(false), [voidMessage, setVoidMessage] = React.useState("");
  const [recentReversals, setRecentReversals] = React.useState<OrderReversal[]>([]);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const current = () => mounted.current && live.current === context;
  const data = loaded?.context === context && allowed ? loaded.data : null;
  const reload = React.useCallback(async () => {
    if (!current()) return false;
    const version = ++generation.current;
    setLoaded(null); setLoading(true); setError("");
    if (!allowed) { setLoading(false); return false; }
    try {
      const result = await requestJson<Listing>(`/api/pos/payments${props.branchId ? `?branchId=${encodeURIComponent(props.branchId)}` : ""}`);
      if (!current() || version !== generation.current) return false;
      if (!result || !Array.isArray(result.orders) || result.limit !== 200 || result.orders.length > 200) throw new Error("Unverified order list. Reload safely.");
      setLoaded({ context, data: result }); return true;
    } catch (err) { if (current() && version === generation.current) setError(err instanceof Error ? err.message : "Order list unavailable."); return false; }
    finally { if (current() && version === generation.current) setLoading(false); }
  }, [context, allowed, props.branchId]);
  React.useEffect(() => { setRecentReversals([]); setVoidTargetId(null); setVoidReasonText(""); voidAttempt.current = null; void reload(); return () => { generation.current++; }; }, [reload, props.refreshToken]);

  const eligible = data?.orders.filter(order => ["PAID", "COMPLETED"].includes(order.status)) ?? [];

  async function submitVoid() {
    if (!current() || !canVoid || voidBusy || !voidTargetId) return;
    const attempt = voidAttempt.current?.orderId === voidTargetId ? voidAttempt.current : { orderId: voidTargetId, reason: voidReasonText.trim() };
    if (attempt.reason.length < 3 || attempt.reason.length > 500) { setVoidMessage("Reason must be 3-500 characters."); return; }
    voidAttempt.current = attempt;
    setVoidBusy(true); setVoidMessage("");
    try {
      const result = await requestJson<VoidAck>(`/api/pos/orders/${encodeURIComponent(attempt.orderId)}/void`, { method: "POST", body: JSON.stringify({ reason: attempt.reason }) });
      if (!current() || voidAttempt.current !== attempt) return;
      if (result.order?.status !== "VOIDED" || result.order.id !== attempt.orderId || !validReversal(result.reversal, attempt.orderId)) throw new Error("Unverified void acknowledgment.");
      voidAttempt.current = null; setVoidTargetId(null); setVoidReasonText("");
      setRecentReversals(current => [result.reversal, ...current]);
      setVoidMessage(`Order voided. ${result.reversal.restockedLines.length} line(s) restocked; ${result.reversal.wastedLines.length} line(s) recorded as waste${result.reversal.refundLiabilityAmount ? `; refund liability TZS ${result.reversal.refundLiabilityAmount}` : ""}.`);
      const refreshed = await reload();
      if (current() && !refreshed) setVoidMessage(previous => `${previous} Could not reload the order list; reload manually.`);
      props.onVoided?.();
    } catch (err) {
      if (!current() || voidAttempt.current !== attempt) return;
      if (err instanceof RequestJsonError && err.outcome === "rejected" && !attempt.hadUnknown) { voidAttempt.current = null; setVoidMessage(err.message); }
      else { attempt.hadUnknown = true; setVoidMessage("Void outcome unknown. Press Retry void to replay the exact same reason; do not change the wording or void again separately."); }
    } finally { if (current()) setVoidBusy(false); }
  }

  if (!allowed) return <p role="alert">POS / Cashier permission is required for order void.</p>;
  return <section aria-label="Order void and reversal" className="my-4 space-y-3 rounded-md border p-4">
    <h2 className="text-lg font-semibold">Void a paid order</h2>
    <p>Branch: {props.branchName || "All authorized branches"}. Only a Branch Manager (own branch) or Owner may void a PAID/COMPLETED order. A standalone unpaid order uses the existing cancel action instead.</p>
    <button className={buttonClass} disabled={loading || voidBusy} onClick={() => reload()}>Reload order list</button>
    {loading && <p role="status">Loading voidable orders…</p>}
    {error && <p role="alert">{error}</p>}
    {!canVoid && <p role="alert">You are not authorized to void orders in this scope; read-only.</p>}
    {voidMessage && <p role="status">{voidMessage}</p>}
    {data && !eligible.length && <p>No PAID or COMPLETED order in this scope to void.</p>}
    {eligible.map(order => <article key={order.id} className="space-y-1 rounded border p-3">
      <h3>{order.orderNumber} — {order.status}</h3>
      <p>Branch {order.branchId}; order {order.id}; billed TZS {order.totalAmount}</p>
      {canVoid && voidTargetId !== order.id && <button className={buttonClass} disabled={voidBusy || !!voidAttempt.current} onClick={() => { setVoidTargetId(order.id); setVoidReasonText(""); setVoidMessage(""); }}>Void order</button>}
      {canVoid && voidTargetId === order.id && <div className="space-y-2">
        <label className="block space-y-1 text-xs font-medium"><span>Void reason (3-500 characters)</span>
          <textarea className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" minLength={3} maxLength={500} disabled={voidBusy || !!voidAttempt.current?.hadUnknown} value={voidAttempt.current?.hadUnknown ? voidAttempt.current.reason : voidReasonText} onChange={event => setVoidReasonText(event.target.value)} />
        </label>
        <div className="flex gap-2">
          <button className={buttonClass} disabled={voidBusy} onClick={() => { if (!voidAttempt.current) { setVoidTargetId(null); setVoidReasonText(""); } }}>Cancel</button>
          <button className={buttonClass} disabled={voidBusy || (!voidAttempt.current && (voidReasonText.trim().length < 3 || voidReasonText.trim().length > 500))} onClick={submitVoid}>{voidBusy ? "Voiding…" : voidAttempt.current?.hadUnknown ? "Retry void" : "Confirm void"}</button>
        </div>
      </div>}
    </article>)}
    {recentReversals.length > 0 && <div className="space-y-2 border-t pt-3">
      <h3 className="font-semibold">Recent void reversals (this session)</h3>
      {recentReversals.map(reversal => <article key={reversal.id} className="space-y-1 rounded border p-3">
        <p>Order {reversal.orderId} voided by {reversal.actorName} ({reversal.actorId}) at {reversal.createdAt}</p>
        <p>Reason: {reversal.reason}</p>
        <p>Prior status: {reversal.priorStatus}; original receipt: {reversal.receiptId ?? "none"}; original FINAL: {reversal.finalDocumentId ?? "none"}; COGS at void: TZS {reversal.cogsAmountAtVoid}</p>
        <p>Refund liability: {reversal.refundLiabilityAmount === null ? "None recorded (no captured payment)" : `TZS ${reversal.refundLiabilityAmount} (record only — no bank refund executed)`}</p>
        <p>Restocked: {reversal.restockedLines.length ? reversal.restockedLines.map(l => `${l.name || l.menuItemId} x${l.qty}`).join(", ") : "none"}</p>
        <p>Waste (no new wastage-ledger posting): {reversal.wastedLines.length ? reversal.wastedLines.map(l => `${l.name || l.menuItemId} x${l.qty}`).join(", ") : "none"}</p>
      </article>)}
    </div>}
  </section>;
}
