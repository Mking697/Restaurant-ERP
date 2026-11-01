"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { requestJson, useCurrentUser } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";

const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }

interface RawOption { rawMaterialId: string; name: string; unit: string; }
interface PreparedOption { id: string; name: string; outputUnit: string; }
interface Line { id: string; lineType: "RAW" | "PREPARED"; rawMaterialId: string | null; menuItemId: string | null; qtyRequested: string; qtyApproved: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; qtyIssued: string; qtyReceived: string; }
interface Requisition { id: string; branchId: string; status: "SUBMITTED" | "APPROVED" | "CLOSED"; lines: Line[]; createdAt: string; }
interface Draft { lineType: "RAW" | "PREPARED"; refId: string; qty: string; }
const blankDraft = (): Draft => ({ lineType: "RAW", refId: "", qty: "" });

// GAP-014 — internal requisition (mixed RAW + PREPARED lines, Owner-only
// approval). Fulfillment itself happens via the EXISTING stock-transfers /
// semi-fg-transfers dispatch forms (this panel only tracks the request;
// it never dispatches stock itself). See src/db/schema/requisitions.ts.
export function RequisitionPanel({ branchId }: { branchId: string }) {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const owner = actor.role === "SUPER_ADMIN";
  const [rawOptions, setRawOptions] = React.useState<RawOption[]>([]);
  const [preparedOptions, setPreparedOptions] = React.useState<PreparedOption[]>([]);
  const [requisitions, setRequisitions] = React.useState<Requisition[]>([]);
  const [drafts, setDrafts] = React.useState<Draft[]>([blankDraft()]);
  const [approvals, setApprovals] = React.useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  async function load() {
    const [inv, items, reqs] = await Promise.all([
      requestJson<{ inventory: { rawMaterialId: string; name: string; unit: string }[] }>(`/api/inventory?branchId=${encodeURIComponent(branchId)}`),
      requestJson<{ menuItems: { id: string; name: string; outputUnit: string; isSemiFg: boolean; branchId: string }[] }>(`/api/menu-items?branchId=${encodeURIComponent(branchId)}`),
      requestJson<{ requisitions: Requisition[] }>(`/api/requisitions?branchId=${encodeURIComponent(branchId)}`),
    ]);
    setRawOptions(inv.inventory.map((row) => ({ rawMaterialId: row.rawMaterialId, name: row.name, unit: row.unit })));
    setPreparedOptions(items.menuItems.filter((item) => item.isSemiFg && item.branchId === branchId).map((item) => ({ id: item.id, name: item.name, outputUnit: item.outputUnit })));
    setRequisitions(reqs.requisitions);
  }
  React.useEffect(() => { void load().catch(() => {}); }, [branchId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const lines = drafts.filter((d) => d.refId && d.qty).map((d) => d.lineType === "RAW" ? { lineType: "RAW", rawMaterialId: d.refId, qtyRequested: d.qty } : { lineType: "PREPARED", menuItemId: d.refId, qtyRequested: d.qty });
      if (!lines.length) throw new Error(uiText("Add at least one line.", "Kam az kam ek line add karein."));
      await requestJson("/api/requisitions", { method: "POST", body: JSON.stringify({ branchId, lines }) });
      setMessage(uiText("Requisition submitted.", "Requisition submit ho gayi."));
      setDrafts([blankDraft()]);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not submit."); }
    finally { setBusy(false); }
  }

  async function approve(requisition: Requisition) {
    setBusy(true); setError("");
    try {
      const decisions = approvals[requisition.id] ?? {};
      const lines = Object.fromEntries(requisition.lines.map((line) => [line.id, decisions[line.id] ?? line.qtyRequested]));
      await requestJson(`/api/requisitions/${requisition.id}/approve`, { method: "POST", body: JSON.stringify({ lines }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not approve."); }
    finally { setBusy(false); }
  }

  async function cancelLine(lineId: string) {
    setBusy(true); setError("");
    try { await requestJson(`/api/requisitions/lines/${lineId}/cancel`, { method: "POST" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not cancel."); }
    finally { setBusy(false); }
  }

  const refName = (line: Line) => line.lineType === "RAW" ? rawOptions.find((o) => o.rawMaterialId === line.rawMaterialId)?.name ?? line.rawMaterialId : preparedOptions.find((o) => o.id === line.menuItemId)?.name ?? line.menuItemId;

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div><h3 className="font-semibold">{uiText("Internal requisition (raw + prepared) from Base Kitchen", "Internal requisition (raw + prepared) Base Kitchen se")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{uiText("This tracks the request only — fulfillment happens via the normal transfer dispatch forms, optionally linked to the approved line.", "Yeh sirf request track karta hai \u2014 fulfillment normal transfer dispatch form se hota hai, approved line se optionally link.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}

    <form onSubmit={submit}><fieldset disabled={busy} className="space-y-2">
      {drafts.map((draft, i) => <div key={i} className="flex flex-wrap items-end gap-2">
        <div className="w-28"><Field label={uiText("Type", "Type")}><select className={inputClass} value={draft.lineType} onChange={(e) => setDrafts((prev) => prev.map((d, n) => n === i ? { ...d, lineType: e.target.value as Draft["lineType"], refId: "" } : d))}><option value="RAW">{uiText("Raw", "Raw")}</option><option value="PREPARED">{uiText("Prepared", "Prepared")}</option></select></Field></div>
        <div className="min-w-[160px]"><Field label={uiText("Item", "Item")}><select required className={inputClass} value={draft.refId} onChange={(e) => setDrafts((prev) => prev.map((d, n) => n === i ? { ...d, refId: e.target.value } : d))}><option value="">{uiText("Select", "Chunein")}</option>{(draft.lineType === "RAW" ? rawOptions.map((o) => ({ id: o.rawMaterialId, label: `${o.name} (${o.unit})` })) : preparedOptions.map((o) => ({ id: o.id, label: `${o.name} (${o.outputUnit})` }))).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field></div>
        <div className="w-28"><Field label={uiText("Qty", "Qty")}><input required type="number" min="0.001" step="0.001" className={inputClass} value={draft.qty} onChange={(e) => setDrafts((prev) => prev.map((d, n) => n === i ? { ...d, qty: e.target.value } : d))} /></Field></div>
        <Button type="button" variant="outline" disabled={drafts.length === 1} onClick={() => setDrafts((prev) => prev.filter((_, n) => n !== i))}>{uiText("Remove", "Remove")}</Button>
      </div>)}
      <Button type="button" variant="outline" onClick={() => setDrafts((prev) => [...prev, blankDraft()])}>{uiText("Add line", "Line add karein")}</Button>
      <Button type="submit" disabled={busy}>{uiText("Submit requisition", "Requisition submit karein")}</Button>
    </fieldset></form>

    <div className="space-y-2"><h4 className="text-sm font-medium">{uiText("Requisitions", "Requisitions")}</h4>
      {requisitions.map((req) => <div key={req.id} className="rounded border p-2 text-xs space-y-1">
        <p className="font-medium">{req.status} — {new Date(req.createdAt).toLocaleDateString()}</p>
        {req.lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-2">
          <span>{line.lineType} {refName(line)} — {uiText("requested", "requested")} {line.qtyRequested}{line.qtyApproved !== null ? `, ${uiText("approved", "approved")} ${line.qtyApproved}` : ""} ({line.status}) {uiText("issued", "issued")} {line.qtyIssued} {uiText("received", "received")} {line.qtyReceived}</span>
          {req.status === "SUBMITTED" && owner && <input aria-label={`Approve qty for ${line.id}`} className={`${inputClass} w-20`} placeholder={line.qtyRequested} onChange={(e) => setApprovals((prev) => ({ ...prev, [req.id]: { ...(prev[req.id] ?? {}), [line.id]: e.target.value } }))} />}
          {line.status === "APPROVED" && <Button type="button" variant="outline" disabled={busy} onClick={() => cancelLine(line.id)}>{uiText("Cancel remaining", "Baaki cancel karein")}</Button>}
        </div>)}
        {req.status === "SUBMITTED" && owner && <Button type="button" disabled={busy} onClick={() => approve(req)}>{uiText("Approve requisition", "Requisition approve karein")}</Button>}
      </div>)}
      {!requisitions.length && <p className="text-xs text-muted-foreground">{uiText("No requisitions yet.", "Abhi koi requisition nahi hai.")}</p>}
    </div>
  </section>;
}
