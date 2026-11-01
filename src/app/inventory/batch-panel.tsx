"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { Button } from "@/components/ui/button";

type Batch = { id: string; branchId?: string; warehouseId?: string; rawMaterialId: string; name: string; unit: string; batchNo: string; qtyRemaining: string; expiryDate: string | null; expiryStatus: string; held: boolean; expired: boolean; nearExpiry: boolean };
type Difference = { branchId?: string; warehouseId?: string; rawMaterialId: string; name: string; unit: string; qtyOnHand: string; batchQty: string; unbatchedQty: string };
type Data = { batches: Batch[]; reconciliation: Difference[]; policy: { nearExpiryWarningDays: string | null } };
type Lot = { batchNo: string; qty: string; expiryDate: string; nonExpiring: boolean };
const blankLot = (): Lot => ({ batchNo: "", qty: "", expiryDate: "", nonExpiring: false });
const inputClass = "w-full rounded border p-2";
// Integer thousandths avoid rounding accepting an inexact reconciliation.
function quantity(value: string) { return /^\d+(?:\.\d{1,3})?$/.test(value) ? BigInt(value.split('.')[0]) * BigInt(1000) + BigInt((value.split('.')[1] ?? '').padEnd(3, '0')) : null; }
export function BatchPanel({ branchId, warehouseId, refreshToken = 0 }: { branchId?: string; warehouseId?: string; refreshToken?: number }) {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const allowed = hasCurrentModule(actor, "INVENTORY");
  const owner = actor.role === "SUPER_ADMIN";
  const scope = JSON.stringify([actor.id, actor.ready, actor.authenticated, actor.error, actor.role, actor.branchId, actor.moduleAccess, branchId, warehouseId]);
  const live = React.useRef(scope); live.current = scope;
  const [data, setData] = React.useState<Data | null>(null);
  const [loadedScope, setLoadedScope] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const version = React.useRef(0);
  const [verify, setVerify] = React.useState<Batch | null>(null);
  const [reconcile, setReconcile] = React.useState<Difference | null>(null);
  const [expiryDate, setExpiryDate] = React.useState("");
  const [nonExpiring, setNonExpiring] = React.useState(false);
  const [evidence, setEvidence] = React.useState("");
  const [lots, setLots] = React.useState<Lot[]>([blankLot()]);
  const query = new URLSearchParams(warehouseId ? { warehouseId } : branchId && branchId !== "all" ? { branchId } : {});
  const url = `/api/inventory/batches?${query}`;
  const current = () => live.current === scope && allowed;
  async function load() {
    const token = ++version.current;
    const response = await requestJson<Data>(url);
    if (current() && token === version.current) { setData(response); setLoadedScope(scope); }
  }
  React.useEffect(() => {
    let active = true; setData(null); setError(""); setVerify(null); setReconcile(null); setBusy(false); busyRef.current = false;
    const token = ++version.current;
    if (allowed) void requestJson<Data>(url).then(response => { if (active && current() && token === version.current) { setData(response); setLoadedScope(scope); } }).catch(err => { if (active && current()) setError(err.message); });
    return () => { active = false; version.current++; };
  }, [scope, url, refreshToken, allowed]);
  const visible = loadedScope === scope && allowed ? data : null;
  async function submit(event: React.FormEvent | undefined, verification: boolean) {
    event?.preventDefault();
    if (!current() || !owner || busyRef.current || !evidence.trim()) return;
    const row = verification ? verify : reconcile;
    if (!row) return;
    if (verification && !expiryDate && !nonExpiring) { setError("Enter a verified expiry date or explicitly verify non-expiring."); return; }
    if (!verification) {
      const expected = quantity(reconcile!.unbatchedQty);
      const values = lots.map(l => quantity(l.qty));
      if (values.some(q => q === null || q <= BigInt(0)) || values.reduce<bigint>((sum, q) => sum + (q ?? BigInt(0)), BigInt(0)) !== expected || lots.some(l => !l.batchNo.trim())) { setError("Exact lot quantities must sum to the unbatched difference; each lot needs a real reference."); return; }
    }
    busyRef.current = true; setBusy(true); setError("");
    try {
      await requestJson(verification ? `/api/inventory/batches/${verify!.id}/verify` : "/api/inventory/batches/reconcile", { method: "POST", body: JSON.stringify(verification ? { ...(nonExpiring ? { nonExpiring: true } : { expiryDate }), evidence: evidence.trim() } : { ...(row.warehouseId ? { warehouseId: row.warehouseId } : { branchId: row.branchId }), rawMaterialId: row.rawMaterialId, evidence: evidence.trim(), lots: lots.map(l => ({ batchNo: l.batchNo.trim(), qty: l.qty, ...(l.nonExpiring ? { nonExpiring: true } : l.expiryDate ? { expiryDate: l.expiryDate } : {}) })) }) });
      if (!current()) return;
      // Refresh the exact scope after mutation; never infer success rows locally.
      await load(); if (current()) { setVerify(null); setReconcile(null); }
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Request unconfirmed. Reload and check saved lots before retrying."); }
    finally { if (current()) { busyRef.current = false; setBusy(false); } }
  }
  return <section className="my-6 space-y-3" aria-label={uiText("Expiry batches and exceptions")}>
    <h2 className="font-semibold">{uiText("Expiry batches and exceptions")}</h2>
    <p className="text-sm">{uiText("HELD / unknown-expiry and expired stock cannot be consumed or dispatched. No expiry date never means infinite shelf life. Dispatch uses FEFO and preserves original lots.")}</p>
    <p className="text-sm">{uiText("Near-expiry warning days")}: {visible?.policy.nearExpiryWarningDays ?? uiText("Disabled — Owner has not configured a warning")}</p>
    {error && <p role="alert">{uiText(error)}</p>}
    {!visible ? <p>{uiText("Loading batches…")}</p> : <>
      {visible.batches.map(batch => <article key={batch.id} className="rounded border p-3">
        <p>{batch.name} — {batch.batchNo || uiText("Unknown reference")} — {batch.qtyRemaining} {batch.unit}</p>
        <p>{uiText("Original expiry")}: {batch.expiryDate?.slice(0, 10) ?? (batch.expiryStatus === "NON_EXPIRING" ? uiText("Verified non-expiring") : uiText("Unknown"))} · {uiText(batch.held ? "HELD" : batch.expired ? "EXPIRED" : batch.nearExpiry ? "NEAR EXPIRY" : "Eligible")}</p>
        {owner && batch.expiryStatus === "UNKNOWN" && <Button onClick={() => { setVerify(batch); setReconcile(null); setExpiryDate(""); setNonExpiring(false); setEvidence(""); }}>{uiText("Verify lot")}</Button>}
      </article>)}
      {!visible.batches.length && <p>{uiText("No batches in this scope.")}</p>}
      {visible.reconciliation.map(row => <article key={`${row.warehouseId ?? row.branchId}:${row.rawMaterialId}`} className="rounded border p-3"><p>{row.name} — {uiText("On hand")}: {row.qtyOnHand}; {uiText("Batched")}: {row.batchQty}; {uiText("Unbatched / HELD")}: {row.unbatchedQty} {row.unit}</p>{owner && Number(row.unbatchedQty) > 0 && <Button onClick={() => { setReconcile(row); setVerify(null); setLots([blankLot()]); setEvidence(""); }}>{uiText("Reconcile exact lots")}</Button>}</article>)}
    </>}
    {visible && owner && (verify || reconcile) && <form onSubmit={e => submit(e, !!verify)}><fieldset disabled={busy} className="space-y-3 rounded border p-3">
      <h3>{uiText(verify ? "Verify unknown batch" : "Reconcile unbatched stock — balance is not changed")}</h3>
      {verify ? <><label className="block">{uiText("Verified expiry date")}<input type="date" aria-label="Verified expiry date" className={inputClass} disabled={nonExpiring} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></label><label><input type="checkbox" checked={nonExpiring} onChange={e => setNonExpiring(e.target.checked)} /> {uiText("Owner verified non-expiring (requires evidence)")}</label></> : <>
        <p>{uiText("Lot sum must exactly equal")}: {reconcile?.unbatchedQty}. {uiText("A lot without an expiry stays HELD.")}</p>
        {lots.map((lot, i) => <div key={i} className="space-y-2 rounded border p-2">{([['batchNo', 'Batch reference'], ['qty', 'Lot quantity'], ['expiryDate', 'Lot expiry date']] as const).map(([field, label]) => <label className="block" key={field}>{uiText(label)}<input required={field !== 'expiryDate'} type={field === 'expiryDate' ? 'date' : field === 'qty' ? 'number' : 'text'} min={field === 'qty' ? '0.001' : undefined} step={field === 'qty' ? '0.001' : undefined} disabled={field === 'expiryDate' && lot.nonExpiring} aria-label={`${label} ${i + 1}`} className={inputClass} value={lot[field]} onChange={e => setLots(prev => prev.map((v, n) => n === i ? { ...v, [field]: e.target.value } : v))} /></label>)}<label><input type="checkbox" checked={lot.nonExpiring} onChange={e => setLots(prev => prev.map((v, n) => n === i ? { ...v, nonExpiring: e.target.checked } : v))} /> {uiText("Owner verified non-expiring")}</label><Button type="button" disabled={lots.length === 1} onClick={() => setLots(prev => prev.filter((_, n) => n !== i))}>{uiText("Remove lot")}</Button></div>)}
        <Button type="button" onClick={() => setLots(prev => [...prev, blankLot()])}>{uiText("Add lot")}</Button>
      </>}
      <label className="block">{uiText("Verification evidence")}<textarea required maxLength={1000} aria-label="Verification evidence" className={inputClass} value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
      <Button type="submit" disabled={busy || !evidence.trim()} onClick={e => { e.preventDefault(); void submit(undefined, !!verify); }}>{uiText(verify ? "Save verification" : "Save exact reconciliation")}</Button><Button type="button" onClick={() => { setVerify(null); setReconcile(null); }}>{uiText("Cancel")}</Button>
    </fieldset></form>}
  </section>;
}
