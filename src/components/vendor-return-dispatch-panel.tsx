"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requestJson, useCurrentUser } from "@/lib/current-user";
import { useSelectedBranchId } from "@/lib/current-branch";
import { useUiCopy } from "@/lib/ui-copy";

const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }

interface ReturnRow { id: string; branchId: string; grnId: string; poNumber: string; vendor: string; itemName: string; unit: string; qtyReturned: string; status: string; }
interface DispatchRow { id: string; qtyDispatched: string; reasonNote: string; evidencePhotoUrl: string; dispatchedAt: string; vendorAcknowledgedAt: string | null; }

// GAP-018 — physical dispatch/vendor-acknowledgment of rejected stock
// already claimed in materialReturns (GRN quality FAIL/PARTIAL). Does NOT
// touch inventoryStock (failed qty never entered usable stock) — purely
// evidentiary. Scoped to this EXISTING claim type only.
export function VendorReturnDispatchPanel() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const branchId = useSelectedBranchId();
  const owner = actor.role === "SUPER_ADMIN";
  const [claims, setClaims] = React.useState<ReturnRow[]>([]);
  const [dispatchesByClaimId, setDispatchesByClaimId] = React.useState<Record<string, DispatchRow[]>>({});
  const [drafts, setDrafts] = React.useState<Record<string, { qty: string; reason: string; photoUrl: string }>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function load() {
    const params = branchId && branchId !== "all" ? `?branchId=${encodeURIComponent(branchId)}` : "";
    const res = await requestJson<{ returns: ReturnRow[] }>(`/api/purchase/material-returns${params}`);
    setClaims(res.returns);
    const entries = await Promise.all(res.returns.map(async (c) => {
      const d = await requestJson<{ dispatches: DispatchRow[] }>(`/api/purchase/material-returns/${c.id}/dispatches`).catch(() => ({ dispatches: [] }));
      return [c.id, d.dispatches] as const;
    }));
    setDispatchesByClaimId(Object.fromEntries(entries));
  }
  React.useEffect(() => { void load().catch(() => {}); }, [branchId]);

  const draftFor = (id: string) => drafts[id] ?? { qty: "", reason: "", photoUrl: "" };
  const setDraft = (id: string, patch: Partial<{ qty: string; reason: string; photoUrl: string }>) => setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }));

  async function dispatch(claimId: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const d = draftFor(claimId);
      await requestJson(`/api/purchase/material-returns/${claimId}/dispatches`, { method: "POST", body: JSON.stringify({ qtyDispatched: d.qty, reasonNote: d.reason, evidencePhotoUrl: d.photoUrl || undefined }) });
      setDrafts((prev) => ({ ...prev, [claimId]: { qty: "", reason: "", photoUrl: "" } }));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not record dispatch."); }
    finally { setBusy(false); }
  }
  async function acknowledge(dispatchId: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await requestJson(`/api/purchase/material-return-dispatches/${dispatchId}/acknowledge`, { method: "POST" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not acknowledge."); }
    finally { setBusy(false); }
  }
  async function cancelRemaining(claimId: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await requestJson(`/api/purchase/material-returns/${claimId}/cancel-remaining`, { method: "POST", body: JSON.stringify({}) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not cancel remaining."); }
    finally { setBusy(false); }
  }

  const dispatchedQty = (claimId: string) => dispatchesByClaimId[claimId]?.reduce((sum, d) => sum + Number(d.qtyDispatched), 0) ?? 0;

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div><h3 className="font-semibold">{uiText("Physical return dispatch (GAP-018)", "Physical return dispatch (GAP-018)")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{uiText("Rejected stock never entered usable inventory, so dispatch here never touches stock — it is only evidence that the physical goods were actually sent back to the vendor and acknowledged.", "Rejected stock kabhi usable inventory mein gaya hi nahi, isliye dispatch yahan stock ko touch nahi karta \u2014 yeh sirf evidence hai ki physical goods vendor ko bhej diye gaye.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

    <div className="space-y-3">
      {claims.map((c) => {
        const dispatched = dispatchedQty(c.id);
        const remaining = Number(c.qtyReturned) - dispatched;
        return <div key={c.id} className="rounded border p-3 text-xs space-y-2">
          <p className="font-medium">{c.poNumber} — {c.vendor} — {c.itemName} ({c.qtyReturned} {c.unit} {uiText("claimed", "claimed")})</p>
          {(dispatchesByClaimId[c.id] ?? []).map((d) => <div key={d.id} className="flex items-center justify-between gap-2 border-t pt-1">
            <span>{d.qtyDispatched} {c.unit} — {d.reasonNote} ({new Date(d.dispatchedAt).toLocaleDateString()})</span>
            {d.vendorAcknowledgedAt ? <Badge variant="default">{uiText("Acknowledged", "Acknowledged")}</Badge> : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => acknowledge(d.id)}>{uiText("Mark vendor-acknowledged", "Vendor-acknowledged mark karein")}</Button>}
          </div>)}
          <p className="text-muted-foreground">{uiText(`Remaining undispatched: ${remaining.toFixed(3)} ${c.unit}`, `Baaki undispatched: ${remaining.toFixed(3)} ${c.unit}`)}</p>
          {remaining > 0 && <div className="flex flex-wrap items-end gap-2">
            <div className="w-24"><Field label={uiText("Qty", "Qty")}><input className={inputClass} value={draftFor(c.id).qty} onChange={(e) => setDraft(c.id, { qty: e.target.value })} /></Field></div>
            <div className="min-w-[160px]"><Field label={uiText("Reason", "Reason")}><input className={inputClass} value={draftFor(c.id).reason} onChange={(e) => setDraft(c.id, { reason: e.target.value })} /></Field></div>
            <div className="min-w-[160px]"><Field label={uiText("Evidence photo URL (optional)", "Evidence photo URL (optional)")}><input className={inputClass} value={draftFor(c.id).photoUrl} onChange={(e) => setDraft(c.id, { photoUrl: e.target.value })} /></Field></div>
            <Button type="button" size="sm" disabled={busy} onClick={() => dispatch(c.id)}>{uiText("Record dispatch", "Dispatch record karein")}</Button>
            {owner && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => cancelRemaining(c.id)}>{uiText("Cancel remaining", "Baaki cancel karein")}</Button>}
          </div>}
        </div>;
      })}
      {!claims.length && <p className="text-xs text-muted-foreground">{uiText("No claims yet.", "Abhi koi claim nahi hai.")}</p>}
    </div>
  </section>;
}
