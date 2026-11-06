"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requestJson } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";
import { Field, inputClass } from "./recipe-builder";
import type { MenuItemRow } from "./menu-ui-helpers";

interface BranchRow { id: string; name: string; }
interface Transfer { id: string; fromBranchId: string; toBranchId: string; sourceMenuItemId: string; destMenuItemId: string; outputUnitAtDispatch: string; qtyDispatched: string; qtyReceived: string | null; status: "DISPATCHED" | "RECEIVED"; dispatchedAt: string; }

// GAP-013 — branch-to-branch prepared Semi-FG transfer ("Base Kitchen" ->
// another branch), name-matched destination identity, full idempotent
// partial-receive flow. A SEPARATE mechanism from the existing RAW
// CENTRAL-warehouse transfer (src/app/warehouse) — Semi-FG has no
// warehouse concept. Cost-carry is explicitly out of scope this pass (see
// src/db/schema/semi-fg-transfers.ts).
export function SemiFgTransferPanel({ branchId, items, branches }: { branchId: string; items: MenuItemRow[]; branches: BranchRow[] }) {
  const uiText = useUiCopy();
  const [transfers, setTransfers] = React.useState<Transfer[]>([]);
  const [toBranchId, setToBranchId] = React.useState("");
  const [sourceMenuItemId, setSourceMenuItemId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [receiveQty, setReceiveQty] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  async function load() {
    const result = await requestJson<{ semiFgTransfers: Transfer[] }>(`/api/semi-fg-transfers?branchId=${encodeURIComponent(branchId)}`);
    setTransfers(result.semiFgTransfers);
  }
  React.useEffect(() => { void load().catch(() => {}); }, [branchId]);

  async function dispatch(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await requestJson("/api/semi-fg-transfers", { method: "POST", body: JSON.stringify({ fromBranchId: branchId, toBranchId, sourceMenuItemId, qtyDispatched: qty }) });
      setMessage(uiText("Dispatched.", "Dispatch ho gaya."));
      setToBranchId(""); setSourceMenuItemId(""); setQty("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not dispatch."); }
    finally { setBusy(false); }
  }

  async function receive(transfer: Transfer) {
    const qtyReceived = receiveQty[transfer.id] ?? transfer.qtyDispatched;
    setBusy(true); setError("");
    try {
      await requestJson(`/api/semi-fg-transfers/${transfer.id}/receive`, { method: "POST", body: JSON.stringify({ qtyReceived }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not receive."); }
    finally { setBusy(false); }
  }

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const incoming = transfers.filter((t) => t.toBranchId === branchId && t.status === "DISPATCHED");

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div><h3 className="font-semibold">{uiText("Prepared Semi-FG transfer (branch to branch)", "Prepared Semi-FG transfer (branch se branch)")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{uiText("Destination item is matched by exact name + unit. Real cost is not carried across this transfer yet.", "Destination item exact naam + unit se match hota hai. Real cost abhi transfer ke saath carry nahi hota.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}

    <form onSubmit={dispatch}><fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[180px]"><Field label={uiText("Prepared item (this branch)", "Prepared item (yeh branch)")}><Select required value={sourceMenuItemId} onChange={(e) => setSourceMenuItemId(e.target.value)}><option value="">{uiText("Select", "Chunein")}</option>{items.filter((item) => item.isSemiFg && item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field></div>
      <div className="min-w-[180px]"><Field label={uiText("To branch", "Kis branch ko")}><Select required value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}><option value="">{uiText("Select", "Chunein")}</option>{branches.filter((b) => b.id !== branchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field></div>
      <div className="w-32"><Field label={uiText("Qty", "Qty")}><Input required type="number" min="0.001" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} /></Field></div>
      <Button type="submit" disabled={busy}>{uiText("Dispatch", "Dispatch karein")}</Button>
    </fieldset></form>

    <div className="space-y-2"><h4 className="text-sm font-medium">{uiText("Incoming — awaiting receipt", "Incoming — receipt ka intezaar")}</h4>
      {!incoming.length && <p className="text-xs text-muted-foreground">{uiText("Nothing awaiting receipt.", "Kuch receipt ke liye pending nahi hai.")}</p>}
      {incoming.map((t) => <div key={t.id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs">
        <span>{uiText("From", "Se")} {branchName(t.fromBranchId)}: {itemName(t.destMenuItemId)} — {t.qtyDispatched} {t.outputUnitAtDispatch}</span>
        <input aria-label={`Qty received for ${t.id}`} className={`${inputClass} w-24`} placeholder={t.qtyDispatched} value={receiveQty[t.id] ?? ""} onChange={(e) => setReceiveQty((prev) => ({ ...prev, [t.id]: e.target.value }))} />
        <Button type="button" disabled={busy} onClick={() => receive(t)}>{uiText("Receive", "Receive karein")}</Button>
      </div>)}
    </div>

    <div className="space-y-1"><h4 className="text-sm font-medium">{uiText("History", "History")}</h4>
      {transfers.map((t) => <p key={t.id} className="text-xs text-muted-foreground">{branchName(t.fromBranchId)} → {branchName(t.toBranchId)}: {itemName(t.sourceMenuItemId)} {t.qtyDispatched} {t.outputUnitAtDispatch} — {t.status}{t.qtyReceived !== null ? ` (${uiText("received", "received")} ${t.qtyReceived})` : ""}</p>)}
      {!transfers.length && <p className="text-xs text-muted-foreground">{uiText("No transfers yet.", "Abhi koi transfer nahi hai.")}</p>}
    </div>
  </section>;
}
