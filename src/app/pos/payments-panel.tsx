"use client";
import * as React from "react";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import type { PaymentOrderSummary } from "@/lib/pos-payments";
import { PosDocumentPreview } from "@/components/pos-document-preview";

type Listing = { orders: PaymentOrderSummary[]; visibilityScope: "actual" | "access-filtered"; limit: number; truncated: boolean; legacyNotice: string };
type Props = { branchId: string; branchName: string; identity: string; allowed: boolean; refreshToken?: number };
const buttonClass = "rounded-md border px-3 py-2 text-sm disabled:opacity-50";
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const money = (value: unknown): value is string => typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value) && Number.isFinite(Number(value));
const cents = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")); };
const sameMoney = (a: unknown, b: unknown) => money(a) && money(b) && cents(a) === cents(b);
function validOrder(order: PaymentOrderSummary, branchId: string) {
  if (!order || !nonempty(order.id) || !nonempty(order.branchId) || (branchId && order.branchId !== branchId) || !nonempty(order.orderNumber) || !["OPEN", "PAID", "COMPLETED"].includes(order.status) || !money(order.totalAmount)) return false;
  if (order.coverage === "OPEN") return order.status === "OPEN" && sameMoney(order.collectedAmount, "0") && sameMoney(order.outstandingAmount, order.totalAmount) && order.legacyRecordedAmount === null && order.unavailableReason === null && order.payment === null;
  if (order.coverage === "UNAVAILABLE") return order.collectedAmount === null && order.outstandingAmount === null && order.legacyRecordedAmount === null && nonempty(order.unavailableReason) && order.payment === null;
  if (order.status === "OPEN") return false;
  if (order.coverage === "LEGACY") return order.collectedAmount === null && order.outstandingAmount === null && sameMoney(order.legacyRecordedAmount, order.totalAmount) && order.unavailableReason === null && order.payment === null;
  if (order.coverage !== "CAPTURED" || !sameMoney(order.collectedAmount, order.totalAmount) || !sameMoney(order.outstandingAmount, "0") || order.legacyRecordedAmount !== null || order.unavailableReason !== null) return false;
  const p = order.payment, a = p?.allocation;
  return !!p && nonempty(p.id) && p.branchId === order.branchId && p.orderId === order.id && nonempty(p.receiptId) && nonempty(p.receiptNumber) && sameMoney(p.amount, order.totalAmount) &&
    ["CASH", "UPI", "CARD"].includes(p.tenderType) && typeof p.tenderCurrencyCode === "string" && /^[A-Z]{3}$/.test(p.tenderCurrencyCode) && money(p.tenderCurrencyAmount) && typeof p.fxRateToInr === "string" && /^\d+(?:\.\d+)?$/.test(p.fxRateToInr) && Number.isFinite(Number(p.fxRateToInr)) && Number(p.fxRateToInr) > 0 &&
    nonempty(p.collectorId) && nonempty(p.collectorName) && nonempty(p.shiftRunId) && typeof p.collectedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(p.collectedAt) && Number.isFinite(Date.parse(p.collectedAt)) && ["CREATE", "SETTLE"].includes(p.sourceAction) &&
    ((p.finalDocumentId === null && p.finalDocumentNumber === null) || (nonempty(p.finalDocumentId) && nonempty(p.finalDocumentNumber))) &&
    !!a && nonempty(a.id) && a.orderId === order.id && a.receiptId === p.receiptId && a.finalDocumentId === p.finalDocumentId && sameMoney(a.amount, p.amount);
}

export function PosPaymentsPanel(props: Props) {
  const actor = useCurrentUser();
  const allowed = props.allowed && actor.authenticated && hasCurrentModule(actor, "POS_CASHIER");
  const context = JSON.stringify([props.identity, props.branchId, allowed, actor.id, actor.role, actor.branchId, actor.moduleAccess, props.refreshToken]);
  const live = React.useRef(context); live.current = context;
  const mounted = React.useRef(true), generation = React.useRef(0);
  const [loaded, setLoaded] = React.useState<{ context: string; data: Listing } | null>(null);
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState("");
  const [documentId, setDocumentId] = React.useState<string | null>(null);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const current = () => mounted.current && live.current === context;
  const data = loaded?.context === context && allowed ? loaded.data : null;
  const reload = React.useCallback(async () => {
    if (!current()) return false;
    const version = ++generation.current;
    setLoaded(null); setDocumentId(null); setLoading(true); setError("");
    if (!allowed) { setLoading(false); return false; }
    try {
      const result = await requestJson<Listing>(`/api/pos/payments${props.branchId ? `?branchId=${encodeURIComponent(props.branchId)}` : ""}`);
      if (!current() || version !== generation.current) return false;
      const branchId = actor.role === "SUPER_ADMIN" ? props.branchId : actor.branchId;
      if ((!branchId && actor.role !== "SUPER_ADMIN") || (actor.role !== "SUPER_ADMIN" && props.branchId && props.branchId !== actor.branchId) || !result || !Array.isArray(result.orders) || result.limit !== 200 || result.orders.length > 200 || result.visibilityScope !== (actor.role === "SUPER_ADMIN" ? "actual" : "access-filtered") || typeof result.truncated !== "boolean" || typeof result.legacyNotice !== "string" || result.orders.some(order => !validOrder(order, branchId ?? "")) || new Set(result.orders.map(order => order.id)).size !== result.orders.length) throw new Error("Unverified payment history response. Reload safely.");
      setLoaded({ context, data: result }); return true;
    } catch (err) { if (current() && version === generation.current) setError(err instanceof Error ? err.message : "Payment history unavailable."); return false; }
    finally { if (current() && version === generation.current) setLoading(false); }
  }, [context, allowed, props.branchId]);
  React.useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  if (!allowed) return <p role="alert">POS / Cashier permission is required for payment history.</p>;
  return <section aria-label="Payment and order history" className="my-4 space-y-3 rounded-md border p-4">
    <h2 className="text-lg font-semibold">Payment / order history</h2>
    <p>Branch: {props.branchName || "All authorized branches"}. Read-only history; use the existing order controls for full settlement. Standalone proformas are not debt.</p>
    <button className={buttonClass} disabled={loading} onClick={() => reload()}>Reload payment history</button>
    {loading && <p role="status">Loading payment history…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <><p>{data.visibilityScope === "actual" ? "Actual scope" : "Access-filtered scope — not actual branch totals"}. History bound: {data.limit}. {data.truncated ? "Results truncated; narrow branch scope. These rows are not complete totals." : "No history truncation reported."}</p><p>{data.legacyNotice}</p></>}
    {data?.orders.map(order => <article key={order.id} className="space-y-1 rounded border p-3">
      <h3>{order.orderNumber} — {order.status} / {order.coverage}</h3>
      <p>Branch {order.branchId}; order {order.id}</p>
      <p>Billed: TZS {order.totalAmount}; Collected: {order.collectedAmount === null ? "Unavailable" : `TZS ${order.collectedAmount}`}; Outstanding: {order.outstandingAmount === null ? "Unavailable" : `TZS ${order.outstandingAmount}`}</p>
      {order.coverage === "OPEN" && <p>Unpaid OPEN order; collection has not been recorded.</p>}
      {order.coverage === "LEGACY" && <p>Legacy recorded paid amount: TZS {order.legacyRecordedAmount}. Historical collection / collector evidence unavailable; not a fresh verified collection or unpaid debt.</p>}
      {order.coverage === "UNAVAILABLE" && <p role="alert">Collection evidence unavailable: {order.unavailableReason}. No paid or zero-balance projection is assumed.</p>}
      {order.payment && <><p>Original receipt: {order.payment.receiptNumber} ({order.payment.receiptId}); payment {order.payment.id}; allocation {order.payment.allocation.id}</p>
        <p>Actual collector: {order.payment.collectorName} ({order.payment.collectorId}); collecting shift: {order.payment.shiftRunId}; collected at {order.payment.collectedAt}; source {order.payment.sourceAction}</p>
        <p>Saved tender: {order.payment.tenderType}; {order.payment.tenderCurrencyCode === "INR" ? "TZS (saved currency code INR)" : order.payment.tenderCurrencyCode} {order.payment.tenderCurrencyAmount}; saved FX: 1 tender unit = TZS {order.payment.fxRateToInr}</p>
        {order.payment.finalDocumentId ? <button className={buttonClass} onClick={() => { if (current()) setDocumentId(order.payment!.finalDocumentId); }}>View original FINAL {order.payment.finalDocumentNumber}</button> : <p>Original FINAL unavailable; existing receipt and collection remain linked. No document is invented.</p>}
      </>}
    </article>)}
    {data && !data.orders.length && <p>No eligible payment / order history in this scope.</p>}
    <PosDocumentPreview documentId={data ? documentId : null} onClose={() => setDocumentId(null)} />
  </section>;
}
