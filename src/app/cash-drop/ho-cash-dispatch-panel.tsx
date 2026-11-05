"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { requestJson } from "@/lib/current-user";
import { formatInr } from "@/lib/utils";

type Dispatch = {
  id: string; branchId: string; status: "PENDING" | "ACCEPTED";
  countedCashInr: string; retainedFloatInr: string; dispatchedAmountInr: string;
  dispatchedAt: string; dispatchedBy: string;
  acceptedAmountInr: string | null; discrepancyInr: string | null;
};

// GAP-036: Head Office review queue — Owner/SUPER_ADMIN only. Every branch's
// pending cash dispatch is shown here; accepting records what HO actually
// counted (may differ from what was dispatched) as a signed discrepancy.
export function HoCashDispatchPanel() {
  const uiText = useUiCopy();
  const [rows, setRows] = React.useState<Dispatch[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [accepting, setAccepting] = React.useState<string | null>(null);
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});

  const reload = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await requestJson<{ dispatches: Dispatch[] }>("/api/ho-cash-dispatches");
      setRows(result.dispatches);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load Head Office cash dispatches."); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void reload(); }, [reload]);

  async function accept(id: string) {
    setAccepting(id); setError("");
    try {
      const amount = amounts[id]?.trim();
      await requestJson(`/api/ho-cash-dispatches/${encodeURIComponent(id)}/accept`, { method: "POST", body: JSON.stringify({ acceptedAmountInr: amount || undefined }) });
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not confirm acceptance. Verify saved records before retrying."); }
    finally { setAccepting(null); }
  }

  const pending = rows?.filter(r => r.status === "PENDING") ?? [];
  return <section aria-label="Head Office cash dispatches" className="mb-4 space-y-3 rounded-md border p-4">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">{uiText("Head Office — incoming cash dispatches", "Head Office — aane wale cash dispatches")}</h2>
      <button className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50" disabled={loading} onClick={() => reload()}>{uiText("Reload")}</button>
    </div>
    {loading && <p role="status">{uiText("Loading…")}</p>}
    {error && <p role="alert">{uiText(error)}</p>}
    {rows && (pending.length ? pending.map(row => <div key={row.id} className="space-y-2 rounded-md bg-muted p-3">
      <p className="text-sm">{uiText("Branch:")} {row.branchId} — {uiText("in transit:")} <strong>{formatInr(Number(row.dispatchedAmountInr))}</strong> ({uiText("dispatched")} {new Date(row.dispatchedAt).toLocaleString()})</p>
      <div className="flex items-center gap-2">
        <input type="number" min={0} step="0.01" placeholder={uiText("Amount actually received (TSh) — leave blank if it matches exactly")} value={amounts[row.id] ?? ""} onChange={(e) => setAmounts(a => ({ ...a, [row.id]: e.target.value }))} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
        <button className="shrink-0 rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={accepting === row.id} onClick={() => accept(row.id)}>{accepting === row.id ? uiText("Accepting…") : uiText("Accept")}</button>
      </div>
    </div>) : <p className="text-sm text-muted-foreground">{uiText("No pending cash dispatches.")}</p>)}
  </section>;
}
