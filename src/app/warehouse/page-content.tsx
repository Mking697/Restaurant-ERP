"use client";
import { useUiCopy } from "@/lib/ui-copy";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { Truck, Warehouse as WarehouseIcon, PackageCheck } from "lucide-react";

interface WarehouseRow { id: string; type: "CENTRAL" | "BRANCH"; branchId: string | null; name: string; createdAt: string; }
interface TransferRow { id: string; fromWarehouseId: string; toWarehouseId: string; rawMaterialId: string; qtyDispatched: string; qtyReceived: string | null; status: "DISPATCHED" | "RECEIVED" | "CANCELLED"; dispatchedAt: string; receivedAt: string | null; }
interface RawMaterialRow { id: string; name: string; unit: string; }

const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
const STATUS_VARIANT: Record<string, "warning" | "success" | "destructive"> = { DISPATCHED: "warning", RECEIVED: "success", CANCELLED: "destructive" };

export default function WarehousePage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches } = useBranches();
  const allowed = hasCurrentModule(actor, "INVENTORY");
  const isOwner = actor.role === "SUPER_ADMIN";

  const [warehouses, setWarehouses] = React.useState<WarehouseRow[]>([]);
  const [transfers, setTransfers] = React.useState<TransferRow[]>([]);
  const [materials, setMaterials] = React.useState<RawMaterialRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  const [whOpen, setWhOpen] = React.useState(false);
  const [whType, setWhType] = React.useState<"CENTRAL" | "BRANCH">("CENTRAL");
  const [whName, setWhName] = React.useState("");
  const [whBranchId, setWhBranchId] = React.useState("");
  const [whBusy, setWhBusy] = React.useState(false);

  const [dispatchOpen, setDispatchOpen] = React.useState(false);
  const [fromWarehouseId, setFromWarehouseId] = React.useState("");
  const [toWarehouseId, setToWarehouseId] = React.useState("");
  const [rawMaterialId, setRawMaterialId] = React.useState("");
  const [qtyDispatched, setQtyDispatched] = React.useState("1");
  const [dispatchBusy, setDispatchBusy] = React.useState(false);

  const [receiveId, setReceiveId] = React.useState("");
  const [qtyReceived, setQtyReceived] = React.useState("");
  const [receiveBusy, setReceiveBusy] = React.useState(false);
  const [receiveResult, setReceiveResult] = React.useState<{ variance: string } | null>(null);

  const transfersUrl = "/api/stock-transfers" + (selected !== "all" ? `?branchId=${encodeURIComponent(selected)}` : "");
  const scopeKey = `${actor.id}:${selected}`;

  const loadAll = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [wh, tr, mat] = await Promise.all([
        requestJson<{ warehouses: WarehouseRow[] }>("/api/warehouses"),
        requestJson<{ stockTransfers: TransferRow[] }>(transfersUrl),
        requestJson<{ rawMaterials: RawMaterialRow[] }>("/api/raw-materials"),
      ]);
      setWarehouses(wh.warehouses); setTransfers(tr.stockTransfers); setMaterials(mat.rawMaterials);
    } catch (err) { setError(err instanceof Error ? err.message : "Load failed"); }
    finally { setLoading(false); }
  }, [transfersUrl]);

  React.useEffect(() => { if (allowed) void loadAll(); }, [allowed, scopeKey, loadAll]);

  const centralWarehouses = warehouses.filter((w) => w.type === "CENTRAL");
  const branchWarehouses = warehouses.filter((w) => w.type === "BRANCH");
  const myBranchWarehouse = branchWarehouses.find((w) => w.branchId === (isOwner ? selected : actor.branchId));
  const warehouseLabel = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const materialLabel = (id: string) => { const m = materials.find((x) => x.id === id); return m ? `${m.name} (${m.unit})` : id; };
  const branchLabel = (branchId: string | null) => branches.find((b) => b.id === branchId)?.name ?? (branchId ? branchId : "—");

  async function createWarehouse(e: React.FormEvent) {
    e.preventDefault(); setWhBusy(true); setError(""); setMessage("");
    try {
      await requestJson("/api/warehouses", { method: "POST", body: JSON.stringify(whType === "CENTRAL" ? { type: "CENTRAL", name: whName } : { type: "BRANCH", name: whName, branchId: whBranchId }) });
      setWhOpen(false); setWhName(""); setWhBranchId(""); setMessage(uiText("Warehouse created."));
      await loadAll();
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setWhBusy(false); }
  }

  async function dispatchTransfer(e: React.FormEvent) {
    e.preventDefault(); setDispatchBusy(true); setError("");
    try {
      await requestJson("/api/stock-transfers", { method: "POST", body: JSON.stringify({ fromWarehouseId, toWarehouseId, rawMaterialId, qtyDispatched }) });
      setDispatchOpen(false); setQtyDispatched("1"); setRawMaterialId(""); setMessage(uiText("Transfer dispatched."));
      await loadAll();
    } catch (err) { setError(err instanceof Error ? err.message : "Dispatch failed"); }
    finally { setDispatchBusy(false); }
  }

  async function receiveTransfer() {
    if (!receiveId) return;
    setReceiveBusy(true); setError(""); setReceiveResult(null);
    try {
      const data = await requestJson<{ stockTransfer: TransferRow; variance: string }>(`/api/stock-transfers/${receiveId}/receive`, { method: "POST", body: JSON.stringify({ qtyReceived }) });
      setReceiveResult({ variance: data.variance });
      await loadAll();
    } catch (err) { setError(err instanceof Error ? err.message : "Receive failed"); }
    finally { setReceiveBusy(false); }
  }

  return <AppShell activeHref="/warehouse">
    <PageHeader title={uiText("Warehouse & Stock Transfers")} description={uiText("2-level stock: Central warehouse dispatches raw material, branch confirms receipt — inventory only moves on receive.", "2-level stock: Central warehouse se raw material dispatch hota hai, branch receive confirm karti hai — inventory sirf receive par move hoti hai.")}>
      <div className="flex gap-2">
        {isOwner && <Dialog open={whOpen} onOpenChange={(v) => { setWhOpen(v); if (v) { setError(""); setWhType("CENTRAL"); setWhName(""); setWhBranchId(""); } }}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><WarehouseIcon className="size-4" /> {uiText("New Warehouse")}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{uiText("New Warehouse")}</DialogTitle><DialogDescription>{uiText("A CENTRAL warehouse is HQ-level bulk stock; a BRANCH warehouse belongs to one branch's local store.")}</DialogDescription></DialogHeader>
            <form onSubmit={createWarehouse}><fieldset disabled={whBusy} className="space-y-3">
              {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Type")}</span><select className={inputClass} value={whType} onChange={(e) => setWhType(e.target.value as "CENTRAL" | "BRANCH")}><option value="CENTRAL">{uiText("Central")}</option><option value="BRANCH">{uiText("Branch")}</option></select></label>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Name")}</span><input required className={inputClass} value={whName} onChange={(e) => setWhName(e.target.value)} /></label>
              {whType === "BRANCH" && <label className="block space-y-1 text-xs font-medium"><span>{uiText("Branch")}</span><select required className={inputClass} value={whBranchId} onChange={(e) => setWhBranchId(e.target.value)}><option value="">{uiText("Select")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label>}
              <DialogFooter><Button type="button" variant="outline" onClick={() => setWhOpen(false)}>{uiText("Cancel")}</Button><Button type="submit">{whBusy ? uiText("Saving…") : uiText("Create")}</Button></DialogFooter>
            </fieldset></form>
          </DialogContent>
        </Dialog>}
        {allowed && <Dialog open={dispatchOpen} onOpenChange={(v) => { setDispatchOpen(v); if (v) { setError(""); setFromWarehouseId(centralWarehouses[0]?.id ?? ""); setToWarehouseId(myBranchWarehouse?.id ?? ""); setRawMaterialId(materials[0]?.id ?? ""); setQtyDispatched("1"); } }}>
          <DialogTrigger asChild><Button size="sm"><Truck className="size-4" /> {uiText("Dispatch Transfer")}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{uiText("Dispatch Stock Transfer")}</DialogTitle><DialogDescription>{uiText("Central → Branch only. Branch inventory updates only after the branch confirms receipt.", "Central → Branch hi. Branch inventory sirf receive confirm hone par update hoti hai.")}</DialogDescription></DialogHeader>
            {!centralWarehouses.length || !branchWarehouses.length ? <p role="alert" className="text-destructive">{uiText("Create a CENTRAL and a BRANCH warehouse first.")}</p> : <form onSubmit={dispatchTransfer}><fieldset disabled={dispatchBusy} className="space-y-3">
              {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("From (Central)")}</span><select required className={inputClass} value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>{centralWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("To (Branch)")}</span><select required disabled={!isOwner} className={inputClass} value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}><option value="">{uiText("Select")}</option>{branchWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name} — {branchLabel(w.branchId)}</option>)}</select></label>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Raw material")}</span><select required className={inputClass} value={rawMaterialId} onChange={(e) => setRawMaterialId(e.target.value)}><option value="">{uiText("Select")}</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select></label>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Qty dispatched")}</span><input required type="number" min="0.001" step="0.001" className={inputClass} value={qtyDispatched} onChange={(e) => setQtyDispatched(e.target.value)} /></label>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setDispatchOpen(false)}>{uiText("Cancel")}</Button><Button type="submit" disabled={!toWarehouseId || !rawMaterialId}>{dispatchBusy ? uiText("Dispatching…") : uiText("Dispatch")}</Button></DialogFooter>
            </fieldset></form>}
          </DialogContent>
        </Dialog>}
      </div>
    </PageHeader>

    {!allowed ? <p role="alert">{uiText("Inventory permission is required.")}</p> : <>
      {error && <p role="alert" className="mb-4 text-destructive">{uiText(error)}</p>}{message && <p role="status" className="mb-4">{uiText(message)}</p>}
      <Tabs defaultValue="transfers">
        <TabsList><TabsTrigger value="transfers">{uiText("Stock Transfers")}</TabsTrigger><TabsTrigger value="warehouses">{uiText("Warehouses")}</TabsTrigger></TabsList>

        <TabsContent value="transfers">
          <Card><CardContent className="pt-5">
            {loading ? <p>{uiText("Loading transfers…")}</p> : <Table><TableHeader><TableRow><TableHead>{uiText("Material")}</TableHead><TableHead>{uiText("From")}</TableHead><TableHead>{uiText("To")}</TableHead><TableHead>{uiText("Dispatched")}</TableHead><TableHead>{uiText("Received")}</TableHead><TableHead>{uiText("Status")}</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
              {transfers.map((t) => <TableRow key={t.id}>
                <TableCell>{materialLabel(t.rawMaterialId)}</TableCell>
                <TableCell>{warehouseLabel(t.fromWarehouseId)}</TableCell>
                <TableCell>{warehouseLabel(t.toWarehouseId)}</TableCell>
                <TableCell>{t.qtyDispatched}</TableCell>
                <TableCell>{t.qtyReceived ?? "—"}{t.qtyReceived && Number(t.qtyReceived) < Number(t.qtyDispatched) && <Badge variant="destructive" className="ml-2">{uiText("shortfall")}</Badge>}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge></TableCell>
                <TableCell>{t.status === "DISPATCHED" && <Dialog open={receiveId === t.id} onOpenChange={(v) => { setReceiveId(v ? t.id : ""); setQtyReceived(v ? t.qtyDispatched : ""); setReceiveResult(null); setError(""); }}>
                  <DialogTrigger asChild><Button size="sm" variant="outline"><PackageCheck className="size-4" /> {uiText("Receive")}</Button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>{uiText("Confirm Receipt")}</DialogTitle><DialogDescription>{uiText("Enter the actual quantity received — any shortfall vs dispatched is recorded as transit variance.")}</DialogDescription></DialogHeader>
                    {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
                    <label className="block space-y-1 text-xs font-medium"><span>{uiText("Qty received")}</span><input type="number" min="0" step="0.001" className={inputClass} value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} /></label>
                    {receiveResult && <p className={Number(receiveResult.variance) > 0 ? "text-destructive text-sm" : "text-sm"}>{uiText("Variance:")} {receiveResult.variance}</p>}
                    <DialogFooter><Button type="button" variant="outline" onClick={() => setReceiveId("")}>{uiText("Close")}</Button><Button disabled={receiveBusy} onClick={receiveTransfer}>{receiveBusy ? uiText("Confirming…") : uiText("Confirm Receipt")}</Button></DialogFooter>
                  </DialogContent>
                </Dialog>}</TableCell>
              </TableRow>)}
            </TableBody></Table>}
            {!loading && !transfers.length && <p>{uiText("No stock transfers in this scope.")}</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="warehouses">
          <Card><CardContent className="pt-5">
            <Table><TableHeader><TableRow><TableHead>{uiText("Name")}</TableHead><TableHead>{uiText("Type")}</TableHead><TableHead>{uiText("Branch")}</TableHead></TableRow></TableHeader><TableBody>
              {warehouses.map((w) => <TableRow key={w.id}><TableCell>{w.name}</TableCell><TableCell><Badge variant={w.type === "CENTRAL" ? "default" : "outline"}>{w.type}</Badge></TableCell><TableCell>{branchLabel(w.branchId)}</TableCell></TableRow>)}
            </TableBody></Table>
            {!loading && !warehouses.length && <p>{uiText("No warehouses yet — create a Central warehouse and a Branch warehouse per branch.")}</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>}
  </AppShell>;
}
