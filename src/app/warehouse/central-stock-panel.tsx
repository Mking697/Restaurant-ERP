"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { BatchPanel } from "../inventory/batch-panel";
export function CentralStockPanel({ warehouses, materials }: { warehouses: { id: string; name: string }[]; materials: { id: string; name: string; unit: string }[] }) {
  const uiText = useUiCopy(), actor = useCurrentUser();
  const allowed = hasCurrentModule(actor, "INVENTORY");
  const [warehouseId, setWarehouseId] = React.useState("");
  const [rawMaterialId, setRawMaterialId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [batchNo, setBatchNo] = React.useState("");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [nonExpiring, setNonExpiring] = React.useState(false);
  const [evidence, setEvidence] = React.useState("");
  const [note, setNote] = React.useState("");
  const [balances, setBalances] = React.useState<{ rawMaterialId: string; qtyOnHand: string }[]>([]);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [refresh, setRefresh] = React.useState(0);
  const [loaded, setLoaded] = React.useState("");
  const scope = JSON.stringify([actor.id, actor.role, actor.branchId, actor.ready, actor.authenticated, actor.error, actor.moduleAccess, warehouseId]);
  const live = React.useRef(scope); live.current = scope;
  const current = () => live.current === scope && allowed;
  const url = `/api/warehouses/${encodeURIComponent(warehouseId)}/stock-in`;
  React.useEffect(() => {
    let active = true; setError(""); setBalances([]); setBusy(false); busyRef.current = false;
    if (allowed && warehouseId) void requestJson<{ warehouseStock: typeof balances }>(url).then(data => { if (active && current()) { setBalances(data.warehouseStock); setLoaded(scope); } }).catch(err => { if (active && current()) setError(err.message); });
    return () => { active = false; };
  }, [scope, refresh, allowed, url, warehouseId]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!current() || busyRef.current || !warehouseId || !rawMaterialId || !qty || (nonExpiring && !evidence.trim())) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      await requestJson(url, { method: "POST", body: JSON.stringify({ rawMaterialId, qty, note, ...(batchNo.trim() ? { batchNo: batchNo.trim() } : {}), ...(nonExpiring ? { nonExpiring: true, evidence: evidence.trim() } : expiryDate ? { expiryDate } : {}) }) });
      if (!current()) return;
      const data = await requestJson<{ warehouseStock: typeof balances }>(url);
      if (current()) { setBalances(data.warehouseStock); setLoaded(scope); setQty(""); setBatchNo(""); setExpiryDate(""); setNonExpiring(false); setEvidence(""); setNote(""); setRefresh(n => n + 1); }
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Stock-in unconfirmed; reload and check stock before retrying."); }
    finally { if (current()) { busyRef.current = false; setBusy(false); } }
  }
  return <section aria-label={uiText("Central stock-in and balances")} className="my-4 space-y-3">
    <h2>{uiText("Central stock-in and balances")}</h2>
    <label className="block">{uiText("Central warehouse")}<select aria-label="Central stock warehouse" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}><option value="">{uiText("Select central warehouse")}</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
    {error && <p role="alert">{uiText(error)}</p>}
    {warehouseId && allowed && <>
      {loaded === scope && balances.map(row => <p key={row.rawMaterialId}>{materials.find(m => m.id === row.rawMaterialId)?.name ?? row.rawMaterialId}: {row.qtyOnHand} {materials.find(m => m.id === row.rawMaterialId)?.unit}</p>)}
      <form onSubmit={save}><fieldset disabled={busy} className="space-y-2 rounded border p-3">
        <label className="block">{uiText("Raw material")}<select required aria-label="Central stock material" value={rawMaterialId} onChange={e => setRawMaterialId(e.target.value)}><option value="">{uiText("Select material")}</option>{materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select></label>
        <label className="block">{uiText("Quantity")}<input required aria-label="Central stock quantity" type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)} /></label>
        <label className="block">{uiText("Batch reference")}<input aria-label="Central batch reference" value={batchNo} onChange={e => setBatchNo(e.target.value)} /></label>
        <label className="block">{uiText("Expiry date")}<input aria-label="Central expiry date" type="date" disabled={nonExpiring} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></label>
        <p>{uiText("Unknown expiry remains HELD. Consumption / FEFO dispatch is blocked until Owner verification.")}</p>
        {actor.role === "SUPER_ADMIN" && <><label><input type="checkbox" checked={nonExpiring} onChange={e => setNonExpiring(e.target.checked)} /> {uiText("Owner verified non-expiring")}</label><label className="block">{uiText("Verification evidence")}<input required={nonExpiring} aria-label="Central verification evidence" value={evidence} onChange={e => setEvidence(e.target.value)} /></label></>}
        <label className="block">{uiText("Stock-in note")}<input maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
        <Button type="submit" disabled={busy}>{uiText("Record central stock-in")}</Button>
      </fieldset></form>
      <BatchPanel warehouseId={warehouseId} refreshToken={refresh} />
    </>}
  </section>;
}
