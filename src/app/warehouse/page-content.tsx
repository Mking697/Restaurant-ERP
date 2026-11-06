"use client";
import { useUiCopy } from "@/lib/ui-copy";
import * as React from "react";
import { CentralStockPanel } from "./central-stock-panel";
import { CentralPurchasePanel } from "./central-purchase-panel";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PendingWorkWidget } from "@/components/pending-work-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { Truck, Warehouse as WarehouseIcon, PackageCheck } from "lucide-react";

interface WarehouseRow { id: string; type: "CENTRAL" | "BRANCH"; branchId: string | null; name: string; createdAt: string; }
interface Allocation { id: string; batchNo: string; expiryDate: string | null; expiryStatus: string; qtyDispatched: string; qtyReceived: string | null; }
interface TransferRow { allocations: Allocation[]; id: string; fromWarehouseId: string; toWarehouseId: string; rawMaterialId: string; qtyDispatched: string; qtyReceived: string | null; status: "DISPATCHED" | "RECEIVED" | "CANCELLED"; dispatchedAt: string; receivedAt: string | null; }
interface RawMaterialRow { id: string; name: string; unit: string; }

const STATUS_VARIANT: Record<string, "warning" | "success" | "destructive"> = { DISPATCHED: "warning", RECEIVED: "success", CANCELLED: "destructive" };

export default function WarehousePage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches } = useBranches();
  const allowed = hasCurrentModule(actor, "INVENTORY");
  const isOwner = actor.role === "SUPER_ADMIN";

  const [storedWarehouses, setWarehouses] = React.useState<WarehouseRow[]>([]);
  const [storedTransfers, setTransfers] = React.useState<TransferRow[]>([]);
  const [storedMaterials, setMaterials] = React.useState<RawMaterialRow[]>([]);
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
  const [lotCounts, setLotCounts] = React.useState<Record<string, string>>({});
  const [receiveBusy, setReceiveBusy] = React.useState(false);
  const [receiveResult, setReceiveResult] = React.useState<{ variance: string } | null>(null);

  const transfersUrl = "/api/stock-transfers" + (selected !== "all" ? `?branchId=${encodeURIComponent(selected)}` : "");
  const scopeKey = JSON.stringify([actor.id, actor.ready, actor.authenticated, actor.error, actor.role, actor.branchId, actor.moduleAccess, selected]);
  const live = React.useRef(scopeKey); live.current = scopeKey;
  const current = () => live.current === scopeKey && allowed;
  const [loadedScope, setLoadedScope] = React.useState("");
  const readVersion = React.useRef(0);
  const warehouses = loadedScope === scopeKey && allowed ? storedWarehouses : [];
  const transfers = loadedScope === scopeKey && allowed ? storedTransfers : [];
  const materials = loadedScope === scopeKey && allowed ? storedMaterials : [];

  const loadAll = React.useCallback(async () => {
    const token = ++readVersion.current;
    if (!current()) return;
    setLoading(true); setError("");
    try {
      const [wh, tr, mat] = await Promise.all([
        requestJson<{ warehouses: WarehouseRow[] }>("/api/warehouses"),
        requestJson<{ stockTransfers: TransferRow[] }>(transfersUrl),
        requestJson<{ rawMaterials: RawMaterialRow[] }>("/api/raw-materials"),
      ]);
      if (!current() || token !== readVersion.current) return;
      setLoadedScope(scopeKey); setWarehouses(wh.warehouses); setTransfers(tr.stockTransfers); setMaterials(mat.rawMaterials);
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Load failed"); }
    finally { if (current()) setLoading(false); }
  }, [transfersUrl, scopeKey, allowed]);

  React.useEffect(() => { setWhOpen(false); setDispatchOpen(false); setReceiveId(""); setMessage(""); setError(""); setWhBusy(false); setDispatchBusy(false); setReceiveBusy(false); if (allowed) void loadAll(); return () => { readVersion.current++; }; }, [allowed, scopeKey, loadAll]);

  const centralWarehouses = warehouses.filter((w) => w.type === "CENTRAL");
  const branchWarehouses = warehouses.filter((w) => w.type === "BRANCH");
  const myBranchWarehouse = branchWarehouses.find((w) => w.branchId === (isOwner ? selected : actor.branchId));
  const warehouseLabel = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const materialLabel = (id: string) => { const m = materials.find((x) => x.id === id); return m ? `${m.name} (${m.unit})` : id; };
  const branchLabel = (branchId: string | null) => branches.find((b) => b.id === branchId)?.name ?? (branchId ? branchId : "—");

  async function createWarehouse(e: React.FormEvent) {
    e.preventDefault(); if (!current() || whBusy) return; setWhBusy(true); setError(""); setMessage("");
    try {
      await requestJson("/api/warehouses", { method: "POST", body: JSON.stringify(whType === "CENTRAL" ? { type: "CENTRAL", name: whName } : { type: "BRANCH", name: whName, branchId: whBranchId }) });
      if (!current()) return;
      setWhOpen(false); setWhName(""); setWhBranchId(""); setMessage(uiText("Warehouse created."));
      await loadAll();
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Save failed"); }
    finally { if (current()) setWhBusy(false); }
  }

  async function dispatchTransfer(e: React.FormEvent) {
    e.preventDefault(); if (!current() || dispatchBusy) return; setDispatchBusy(true); setError("");
    try {
      await requestJson("/api/stock-transfers", { method: "POST", body: JSON.stringify({ fromWarehouseId, toWarehouseId, rawMaterialId, qtyDispatched }) });
      if (!current()) return;
      setDispatchOpen(false); setQtyDispatched("1"); setRawMaterialId(""); setMessage(uiText("Transfer dispatched."));
      await loadAll();
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Dispatch failed"); }
    finally { if (current()) setDispatchBusy(false); }
  }

  async function receiveTransfer() {
    if (!receiveId || !current() || receiveBusy) return;
    const transfer = transfers.find(t => t.id === receiveId);
    if (!transfer) return;
    const allocations = (transfer.allocations ?? []).map(lot => ({ allocationId: lot.id, qtyReceived: lotCounts[lot.id] ?? lot.qtyDispatched }));
    const total = allocations.length ? allocations.reduce((sum, a) => sum + Math.round(Number(a.qtyReceived) * 1000), 0) / 1000 : Number(qtyReceived);
    if (!Number.isFinite(total) || total < 0 || total > Number(transfer.qtyDispatched) || allocations.some(a => !/^\d+(?:\.\d{1,3})?$/.test(a.qtyReceived) || Number(a.qtyReceived) > Number(transfer.allocations.find(l => l.id === a.allocationId)!.qtyDispatched))) { setError("Enter valid received counts within each dispatched lot quantity."); return; }
    setReceiveBusy(true); setError(""); setReceiveResult(null);
    try {
      const data = await requestJson<{ stockTransfer: TransferRow; variance: string }>(`/api/stock-transfers/${receiveId}/receive`, { method: "POST", body: JSON.stringify({ qtyReceived: allocations.length ? total.toFixed(3) : qtyReceived, ...(allocations.length ? { allocations: allocations } : {}) }) });
      if (!current()) return;
      setReceiveResult({ variance: data.variance });
      await loadAll();
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Receive failed"); }
    finally { if (current()) setReceiveBusy(false); }
  }

  return <AppShell activeHref="/warehouse">
    <PageHeader title={uiText("Warehouse & Stock Transfers")} description={uiText("2-level stock: Central warehouse dispatches raw material, branch confirms receipt — central stock is reserved on FEFO dispatch; branch stock moves on receive.", "2-level stock: Central warehouse se raw material dispatch hota hai, branch receive confirm karti hai — central stock FEFO dispatch par reserve hota hai, branch stock receive par move hota hai.")}>
      <div className="flex gap-2">
        {isOwner && <Dialog open={whOpen && loadedScope === scopeKey} onOpenChange={(v) => { setWhOpen(v); if (v) { setError(""); setWhType("CENTRAL"); setWhName(""); setWhBranchId(""); } }}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><WarehouseIcon className="size-4" /> {uiText("New Warehouse")}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{uiText("New Warehouse")}</DialogTitle><DialogDescription>{uiText("A CENTRAL warehouse is HQ-level bulk stock; a BRANCH warehouse belongs to one branch's local store.")}</DialogDescription></DialogHeader>
            <form onSubmit={createWarehouse}><fieldset disabled={whBusy} className="space-y-3">
              {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Type")}</span><Select value={whType} onChange={(e) => setWhType(e.target.value as "CENTRAL" | "BRANCH")}><option value="CENTRAL">{uiText("Central")}</option><option value="BRANCH">{uiText("Branch")}</option></Select></label>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Name")}</span><Input required value={whName} onChange={(e) => setWhName(e.target.value)} /></label>
              {whType === "BRANCH" && <label className="block space-y-1 text-xs font-medium"><span>{uiText("Branch")}</span><Select required value={whBranchId} onChange={(e) => setWhBranchId(e.target.value)}><option value="">{uiText("Select")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</Select></label>}
              <DialogFooter><Button type="button" variant="outline" onClick={() => setWhOpen(false)}>{uiText("Cancel")}</Button><Button type="submit">{whBusy ? uiText("Saving…") : uiText("Create")}</Button></DialogFooter>
            </fieldset></form>
          </DialogContent>
        </Dialog>}
        {allowed && <Dialog open={dispatchOpen && loadedScope === scopeKey} onOpenChange={(v) => { setDispatchOpen(v); if (v) { setError(""); setFromWarehouseId(centralWarehouses[0]?.id ?? ""); setToWarehouseId(myBranchWarehouse?.id ?? ""); setRawMaterialId(materials[0]?.id ?? ""); setQtyDispatched("1"); } }}>
          <DialogTrigger asChild><Button size="sm"><Truck className="size-4" /> {uiText("Dispatch Transfer")}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{uiText("Dispatch Stock Transfer")}</DialogTitle><DialogDescription>{uiText("Central → Branch only. FEFO selects eligible lots and preserves original expiry. Expired / HELD / unknown-expiry stock is blocked. Branch inventory updates on receipt.", "Central → Branch hi. Branch inventory sirf receive confirm hone par update hoti hai.")}</DialogDescription></DialogHeader>
            {!centralWarehouses.length || !branchWarehouses.length ? <p role="alert" className="text-destructive">{uiText("Create a CENTRAL and a BRANCH warehouse first.")}</p> : <form onSubmit={dispatchTransfer}><fieldset disabled={dispatchBusy} className="space-y-3">
              {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("From (Central)")}</span><Select required value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>{centralWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("To (Branch)")}</span><Select required disabled={!isOwner} value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}><option value="">{uiText("Select")}</option>{branchWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name} — {branchLabel(w.branchId)}</option>)}</Select></label>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Raw material")}</span><Select required value={rawMaterialId} onChange={(e) => setRawMaterialId(e.target.value)}><option value="">{uiText("Select")}</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</Select></label>
              <label className="block space-y-1 text-xs font-medium"><span>{uiText("Qty dispatched")}</span><Input required type="number" min="0.001" step="0.001" value={qtyDispatched} onChange={(e) => setQtyDispatched(e.target.value)} /></label>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setDispatchOpen(false)}>{uiText("Cancel")}</Button><Button type="submit" disabled={!toWarehouseId || !rawMaterialId}>{dispatchBusy ? uiText("Dispatching…") : uiText("Dispatch")}</Button></DialogFooter>
            </fieldset></form>}
          </DialogContent>
        </Dialog>}
      </div>
    </PageHeader>
    <PendingWorkWidget />

    {!allowed ? <p role="alert">{uiText("Inventory permission is required.")}</p> : <>
      {error && <p role="alert" className="mb-4 text-destructive">{uiText(error)}</p>}{message && <p role="status" className="mb-4">{uiText(message)}</p>}
      <Tabs defaultValue="transfers">
        <TabsList><TabsTrigger value="transfers">{uiText("Stock Transfers")}</TabsTrigger><TabsTrigger value="warehouses">{uiText("Warehouses")}</TabsTrigger><TabsTrigger value="central-purchase">{uiText("Central Purchase")}</TabsTrigger></TabsList>

        <TabsContent value="transfers">
          <Card><CardContent className="pt-5">
            {loading ? <TableSkeleton cols={7} /> : <Table><TableHeader><TableRow><TableHead>{uiText("Material")}</TableHead><TableHead>{uiText("From")}</TableHead><TableHead>{uiText("To")}</TableHead><TableHead>{uiText("Dispatched")}</TableHead><TableHead>{uiText("Received")}</TableHead><TableHead>{uiText("Status")}</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
              {transfers.map((t) => <TableRow key={t.id}>
                <TableCell>{materialLabel(t.rawMaterialId)}</TableCell>
                <TableCell>{warehouseLabel(t.fromWarehouseId)}</TableCell>
                <TableCell>{warehouseLabel(t.toWarehouseId)}</TableCell>
                <TableCell>{t.qtyDispatched}</TableCell>
                <TableCell>{t.qtyReceived ?? "—"}{t.qtyReceived && Number(t.qtyReceived) < Number(t.qtyDispatched) && <Badge variant="destructive" className="ml-2">{uiText("shortfall")}</Badge>}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge></TableCell>
                <TableCell>{t.status === "DISPATCHED" && <Dialog open={receiveId === t.id} onOpenChange={(v) => { setReceiveId(v ? t.id : ""); setQtyReceived(v ? t.qtyDispatched : ""); setLotCounts(Object.fromEntries((t.allocations ?? []).map(l => [l.id, l.qtyDispatched]))); setReceiveResult(null); setError(""); }}>
                  <DialogTrigger asChild><Button size="sm" variant="outline"><PackageCheck className="size-4" /> {uiText("Receive")}</Button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>{uiText("Confirm Receipt")}</DialogTitle><DialogDescription>{uiText("Enter the actual quantity received — any shortfall vs dispatched is recorded as transit variance.")}</DialogDescription></DialogHeader>
                    {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
                    {(t.allocations ?? []).length ? <fieldset disabled={receiveBusy} className="space-y-2"><p>{uiText("Count each original lot separately. Full dispatched quantities are prefilled; change exact lots for a shortfall.")}</p>{t.allocations.map(lot => <label key={lot.id} className="block space-y-1 text-xs"><span>{lot.batchNo} — {uiText("Original expiry")}: {lot.expiryDate?.slice(0, 10) ?? lot.expiryStatus}; {uiText("Dispatched")}: {lot.qtyDispatched}</span><Input aria-label={`Received quantity for lot ${lot.id}`} type="number" min="0" max={lot.qtyDispatched} step="0.001" value={lotCounts[lot.id] ?? lot.qtyDispatched} onChange={e => setLotCounts(prev => ({ ...prev, [lot.id]: e.target.value }))} /></label>)}</fieldset> : <label className="block space-y-1 text-xs font-medium"><span>{uiText("Qty received")}</span><Input type="number" min="0" max={t.qtyDispatched} step="0.001" value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} /></label>}
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
          <CentralStockPanel key={scopeKey} warehouses={centralWarehouses} materials={materials} />
          <Card><CardContent className="pt-5">
            <Table><TableHeader><TableRow><TableHead>{uiText("Name")}</TableHead><TableHead>{uiText("Type")}</TableHead><TableHead>{uiText("Branch")}</TableHead></TableRow></TableHeader><TableBody>
              {warehouses.map((w) => <TableRow key={w.id}><TableCell>{w.name}</TableCell><TableCell><Badge variant={w.type === "CENTRAL" ? "default" : "outline"}>{w.type}</Badge></TableCell><TableCell>{branchLabel(w.branchId)}</TableCell></TableRow>)}
            </TableBody></Table>
            {!loading && !warehouses.length && <p>{uiText("No warehouses yet — create a Central warehouse and a Branch warehouse per branch.")}</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="central-purchase">
          <CentralPurchasePanel key={scopeKey} warehouses={centralWarehouses} materials={materials} />
        </TabsContent>
      </Tabs>
    </>}
  </AppShell>;
}
