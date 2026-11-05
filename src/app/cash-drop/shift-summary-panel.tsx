"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { requestJson } from "@/lib/current-user";
import { formatInr } from "@/lib/utils";

type PendingOrder = { id: string; orderNumber: string; channel: string; tableNo: string; totalAmount: string; createdAt: string; shiftRunId: string; ownerOnly?: boolean };
type Summary = {
  run: { id: string; label: string; startedAt: string } | null;
  visibilityScope: "actual" | "access-filtered";
  collectedTenders: { cash: string; card: string; upi: string; other: string };
  completed: { count: number; visibleTotal: string; actualTotal?: string; privateTotal?: string };
  pendingOrders: { orders: PendingOrder[]; limit: number; truncated: boolean; visibleTotal: string; actualTotal?: string; privateTotal?: string };
};

type Props = { branchId: string; allowed: boolean; refreshToken?: number };

// GAP-034: read-only live shift summary — actual collected cash/card/UPI/other
// for the CURRENT open run (same collection seam as shift-close, read live),
// plus every currently OPEN/unpaid order (which may carry over from an
// earlier, already-ended run) so a cashier never has to guess what is still
// pending vs. actually collected. Never a mutation; never a second totals
// source — if this ever disagrees with the real shift-close figure, the
// close figure is authoritative, this is a live preview only.
export function ShiftSummaryPanel({ branchId, allowed, refreshToken }: Props) {
  const uiText = useUiCopy();
  const [data, setData] = React.useState<Summary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const reload = React.useCallback(async () => {
    if (!allowed || !branchId) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const result = await requestJson<Summary>(`/api/shift-runs/summary?branchId=${encodeURIComponent(branchId)}`);
      if (mounted.current) setData(result);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Live shift summary unavailable.");
    } finally { if (mounted.current) setLoading(false); }
  }, [allowed, branchId]);
  React.useEffect(() => { void reload(); }, [reload, refreshToken]);

  if (!allowed || !branchId) return null;
  return <section aria-label="Live shift summary" className="mb-4 space-y-3 rounded-md border p-4">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">{uiText("Live shift summary")}</h2>
      <button className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50" disabled={loading} onClick={() => reload()}>{uiText("Reload")}</button>
    </div>
    {loading && <p role="status">{uiText("Loading live summary…")}</p>}
    {error && <p role="alert">{uiText(error)}</p>}
    {data && <>
      <p className="text-sm text-muted-foreground">{data.visibilityScope === "actual" ? uiText("Actual scope — real totals including Owner-only orders.") : uiText("Access-filtered scope — not actual branch totals.")}</p>
      {!data.run ? <p>{uiText("No active shift — collected totals below are N/A until one is started.")}</p> : <>
        <p className="text-sm">{uiText("Current run:")} <strong>{data.run.label}</strong> ({uiText("started")} {new Date(data.run.startedAt).toLocaleString()})</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{uiText("Cash collected")}</p><p className="font-semibold">{formatInr(Number(data.collectedTenders.cash))}</p></div>
          <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{uiText("Card collected")}</p><p className="font-semibold">{formatInr(Number(data.collectedTenders.card))}</p></div>
          <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{uiText("UPI collected")}</p><p className="font-semibold">{formatInr(Number(data.collectedTenders.upi))}</p></div>
          <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{uiText("Other collected")}</p><p className="font-semibold">{formatInr(Number(data.collectedTenders.other))}</p></div>
        </div>
        <p className="text-sm">{uiText("Completed/paid orders this run:")} {data.completed.count} — {uiText("visible total")} {formatInr(Number(data.completed.visibleTotal))}{data.completed.actualTotal !== undefined && <> ({uiText("actual")} {formatInr(Number(data.completed.actualTotal))}{data.completed.privateTotal !== undefined && Number(data.completed.privateTotal) > 0 && <>, {uiText("owner-only")} {formatInr(Number(data.completed.privateTotal))}</>})</>}</p>
      </>}
      <div>
        <p className="text-sm font-medium">{uiText("Pending (unpaid, carried over) orders — not counted as cash yet")}</p>
        <p className="text-sm">{uiText("Outstanding visible total:")} {formatInr(Number(data.pendingOrders.visibleTotal))}{data.pendingOrders.actualTotal !== undefined && <> ({uiText("actual")} {formatInr(Number(data.pendingOrders.actualTotal))})</>}</p>
        {data.pendingOrders.truncated && <p role="alert">{uiText("Pending order list truncated at")} {data.pendingOrders.limit}{uiText("; totals above are not limited by this list.")}</p>}
        {data.pendingOrders.orders.length ? <ul className="list-disc pl-5 text-sm">
          {data.pendingOrders.orders.map(order => <li key={order.id}>{order.orderNumber} — {order.channel}{order.tableNo ? ` (${uiText("Table")} ${order.tableNo})` : ""}: {formatInr(Number(order.totalAmount))}{order.shiftRunId && data?.run && order.shiftRunId !== data.run.id ? ` — ${uiText("carried over from an earlier run")}` : ""}</li>)}
        </ul> : <p className="text-sm text-muted-foreground">{uiText("No pending orders.")}</p>}
      </div>
    </>}
  </section>;
}
