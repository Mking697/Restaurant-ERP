"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StepIndicator } from "@/components/step-indicator";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

const PIPELINE_STEPS = [
  { label: "Request" }, { label: "Approval" }, { label: "PO" }, { label: "Bill" },
  { label: "Receive" }, { label: "Quality" }, { label: "Invoice" }, { label: "Payment" },
];

interface Vendor { id: string; name: string }
interface Material { id: string; name: string; unit: string }
interface LineInput { rawMaterialId: string; qty: string; rate: string }
interface RequestRow { id: string; warehouseId: string; requestedBy: string; vendor: string; vendorId: string; linesJson: LineInput[]; valueTsh: string; status: string; createdAt: string }
interface PoRow { id: string; poNumber: string; vendorId: string; vendor: string; status: string; billUploadedAt: string | null; materialReceivedAt: string | null; lines: { rawMaterialId: string; qty: string; rate: string }[] }
interface GrnLine { id: string; rawMaterialId: string; name: string; unit: string; qtyOrdered: string; qtyReceived: string; qtyFailed: string }
interface GrnRow { id: string; poId: string; qualityResult: string; receivedBy: string; lines: GrnLine[] }

// GAP: Central Warehouse Purchase Pipeline (Owner-requested, Nov 2026).
// Mirrors the branch Purchase tab's 3-step Buy -> Bill -> Receive flow plus
// an Owner value-threshold request gate, invoice + 3-way match and payment —
// see src/lib/server/central-purchase.ts for the full design note and its
// deliberate v1 simplifications vs the branch pipeline.
export function CentralPurchasePanel({ warehouses, materials }: { warehouses: { id: string; name: string }[]; materials: Material[] }) {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const allowed = hasCurrentModule(actor, "PURCHASE_ORDER");
  const isOwner = actor.role === "SUPER_ADMIN";
  const canPay = hasCurrentModule(actor, "ACCOUNTS_EXPENSES");

  const { confirm, ConfirmHost } = useConfirm();
  const { notify, notifyError, ToastHost } = useToast();

  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [requests, setRequests] = React.useState<RequestRow[]>([]);
  const [orders, setOrders] = React.useState<PoRow[]>([]);
  const [grns, setGrns] = React.useState<GrnRow[]>([]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [vendorId, setVendorId] = React.useState("");
  const [lines, setLines] = React.useState<LineInput[]>([{ rawMaterialId: "", qty: "", rate: "" }]);

  React.useEffect(() => { if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id); }, [warehouses, warehouseId]);

  const load = React.useCallback(async () => {
    if (!allowed || !warehouseId) return;
    setLoading(true);
    try {
      const [v, r, o, g] = await Promise.all([
        requestJson<{ vendors: Vendor[] }>("/api/purchase/vendors"),
        requestJson<{ centralPurchaseRequests: RequestRow[] }>(`/api/central-purchase/requests?warehouseId=${encodeURIComponent(warehouseId)}`),
        requestJson<{ centralPurchaseOrders: PoRow[] }>(`/api/central-purchase/orders?warehouseId=${encodeURIComponent(warehouseId)}`),
        requestJson<{ centralGrns: GrnRow[] }>(`/api/central-purchase/grns?warehouseId=${encodeURIComponent(warehouseId)}`),
      ]);
      setVendors(v.vendors); setRequests(r.centralPurchaseRequests); setOrders(o.centralPurchaseOrders); setGrns(g.centralGrns);
    } catch (err) { setError(err instanceof Error ? err.message : "Load failed"); }
    finally { setLoading(false); }
  }, [allowed, warehouseId]);

  React.useEffect(() => { setError(""); void load(); }, [load]);

  const materialLabel = (id: string) => { const m = materials.find((x) => x.id === id); return m ? `${m.name} (${m.unit})` : id; };
  const addLine = () => setLines((prev) => [...prev, { rawMaterialId: "", qty: "", rate: "" }]);
  const updateLine = (i: number, patch: Partial<LineInput>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault(); if (busy || !warehouseId || !vendorId) return;
    const cleanLines = lines.filter((l) => l.rawMaterialId && l.qty && l.rate);
    if (!cleanLines.length) { setError(uiText("Add at least one line")); return; }
    setBusy(true); setError("");
    try {
      const result = await requestJson<{ gated: boolean }>("/api/central-purchase/requests", { method: "POST", body: JSON.stringify({ warehouseId, vendorId, lines: cleanLines }) });
      notify(uiText(result.gated ? "Request sent for Owner approval." : "Request auto-approved (below threshold) — you can now create the Purchase Order."));
      setLines([{ rawMaterialId: "", qty: "", rate: "" }]); setVendorId("");
      await load();
    } catch (err) { const msg = err instanceof Error ? err.message : "Request failed"; setError(msg); notifyError(msg); }
    finally { setBusy(false); }
  }

  async function decideRequest(id: string, action: "approve" | "reject") {
    if (busy) return;
    if (action === "reject") {
      const ok = await confirm({ title: uiText("Reject this Central Purchase request?"), description: uiText("This cannot be undone — the requester will need to submit a fresh request."), confirmLabel: uiText("Reject"), destructive: true });
      if (!ok) return;
    }
    setBusy(true); setError("");
    try {
      await requestJson(`/api/central-purchase/requests/${id}/${action}`, { method: "POST" });
      notify(action === "approve" ? uiText("Request approved.") : uiText("Request rejected."));
      await load();
    } catch (err) { const msg = err instanceof Error ? err.message : "Action failed"; setError(msg); notifyError(msg); }
    finally { setBusy(false); }
  }

  async function createOrderFromRequest(req: RequestRow) {
    if (busy) return; setBusy(true); setError("");
    try {
      await requestJson("/api/central-purchase/orders", { method: "POST", body: JSON.stringify({ warehouseId: req.warehouseId, vendorId: req.vendorId, requestId: req.id, lines: req.linesJson }) });
      notify(uiText("Purchase Order created."));
      await load();
    } catch (err) { const msg = err instanceof Error ? err.message : "Create PO failed"; setError(msg); notifyError(msg); }
    finally { setBusy(false); }
  }

  async function receivePo(id: string) {
    if (busy) return; setBusy(true); setError("");
    try { await requestJson(`/api/central-purchase/orders/${id}/receive`, { method: "POST" }); notify(uiText("Material receive recorded.")); await load(); }
    catch (err) { const msg = err instanceof Error ? err.message : "Receive failed"; setError(msg); notifyError(msg); }
    finally { setBusy(false); }
  }

  async function recordQuality(grnId: string, result: "PASS" | "FAIL" | "PARTIAL") {
    if (busy) return; setBusy(true); setError("");
    try {
      await requestJson(`/api/central-purchase/grns/${grnId}/quality`, { method: "POST", body: JSON.stringify({ result, note: result === "PASS" ? "" : "Reported by receiver", failedLines: [] }) });
      notify(result === "PASS" ? uiText("Quality passed — stock credited.") : uiText("Quality result recorded."));
      await load();
    } catch (err) { const msg = err instanceof Error ? err.message : "Quality decision failed"; setError(msg); notifyError(msg); }
    finally { setBusy(false); }
  }

  async function approvePayment(poId: string) {
    if (busy) return; setBusy(true); setError("");
    try { await requestJson(`/api/central-purchase/orders/${poId}/three-way/approve`, { method: "POST" }); notify(uiText("Payment approved.")); await load(); }
    catch (err) { const msg = err instanceof Error ? err.message : "Approve failed"; setError(msg); notifyError(msg); }
    finally { setBusy(false); }
  }

  async function markPaid(poId: string) {
    if (busy) return; setBusy(true); setError("");
    try { await requestJson(`/api/central-purchase/orders/${poId}/three-way/paid`, { method: "POST" }); notify(uiText("Marked paid.")); await load(); }
    catch (err) { const msg = err instanceof Error ? err.message : "Mark paid failed"; setError(msg); notifyError(msg); }
    finally { setBusy(false); }
  }

  const STATUS_VARIANT: Record<string, "warning" | "success" | "destructive" | "outline" | "default"> = {
    PENDING_APPROVAL: "warning", APPROVED: "success", REJECTED: "destructive", CONSUMED: "outline",
    CREATED: "default", RECEIVED: "success", CLOSED: "outline", PASS: "success", FAIL: "destructive", PARTIAL: "warning",
  };

  if (!allowed) return <p role="alert">{uiText("Purchase Order permission is required for Central Purchase.")}</p>;
  if (!warehouses.length) return <p>{uiText("Create a Central warehouse first.")}</p>;

  const approvedUnconsumed = requests.filter((r) => r.status === "APPROVED");
  const pendingApproval = requests.filter((r) => r.status === "PENDING_APPROVAL");
  const openGrns = grns.filter((g) => g.qualityResult === "PENDING");

  return <section className="space-y-6">
    <ConfirmHost />
    <ToastHost />
    <StepIndicator steps={PIPELINE_STEPS} currentIndex={-1} />
    <label className="block max-w-sm space-y-1 text-xs font-medium"><span>{uiText("Central warehouse")}</span>
      <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
    </label>
    {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}

    <Card>
      <CardHeader><CardTitle>{uiText("1. Raise a Central Purchase Request")}</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">{uiText("Above the Owner's indent value threshold, this needs Owner approval before a Purchase Order can be created. Below threshold, it auto-approves.")}</p>
        <form onSubmit={submitRequest}><fieldset disabled={busy} className="space-y-3">
          <label className="block max-w-sm space-y-1 text-xs font-medium"><span>{uiText("Vendor")}</span>
            <Select required value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">{uiText("Select vendor")}</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
          </label>
          {lines.map((line, i) => <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
            <Select required value={line.rawMaterialId} onChange={(e) => updateLine(i, { rawMaterialId: e.target.value })}><option value="">{uiText("Material")}</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</Select>
            <Input required type="number" min="0.001" step="0.001" placeholder={uiText("Qty")} value={line.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} />
            <Input required type="number" min="0.01" step="0.01" placeholder={uiText("Rate (TSh)")} value={line.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} />
            <Button type="button" variant="outline" size="sm" onClick={() => removeLine(i)} disabled={lines.length === 1}>{uiText("✕")}</Button>
          </div>)}
          <Button type="button" variant="outline" size="sm" onClick={addLine}>{uiText("+ Add line")}</Button>
          <div><Button type="submit" disabled={busy}>{busy ? uiText("Submitting…") : uiText("Submit Request")}</Button></div>
        </fieldset></form>
      </CardContent>
    </Card>

    {isOwner && pendingApproval.length > 0 && <Card>
      <CardHeader><CardTitle>{uiText("Owner: requests pending approval")}</CardTitle></CardHeader>
      <CardContent><Table><TableHeader><TableRow><TableHead>{uiText("Vendor")}</TableHead><TableHead>{uiText("Requested by")}</TableHead><TableHead>{uiText("Value (TSh)")}</TableHead><TableHead>{uiText("Lines")}</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
        {pendingApproval.map((r) => <TableRow key={r.id}>
          <TableCell>{r.vendor}</TableCell><TableCell>{r.requestedBy}</TableCell><TableCell>{r.valueTsh}</TableCell>
          <TableCell>{r.linesJson.map((l) => materialLabel(l.rawMaterialId)).join(", ")}</TableCell>
          <TableCell className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => decideRequest(r.id, "approve")}>{uiText("Approve")}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => decideRequest(r.id, "reject")}>{uiText("Reject")}</Button></TableCell>
        </TableRow>)}
      </TableBody></Table></CardContent>
    </Card>}

    <Card>
      <CardHeader><CardTitle>{uiText("2. Approved requests — create Purchase Order")}</CardTitle></CardHeader>
      <CardContent>
        {!approvedUnconsumed.length ? <p className="text-sm text-muted-foreground">{uiText("No approved, unconsumed requests.")}</p> :
          <Table><TableHeader><TableRow><TableHead>{uiText("Vendor")}</TableHead><TableHead>{uiText("Value (TSh)")}</TableHead><TableHead>{uiText("Lines")}</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
            {approvedUnconsumed.map((r) => <TableRow key={r.id}>
              <TableCell>{r.vendor}</TableCell><TableCell>{r.valueTsh}</TableCell>
              <TableCell>{r.linesJson.map((l) => materialLabel(l.rawMaterialId)).join(", ")}</TableCell>
              <TableCell><Button size="sm" disabled={busy} onClick={() => createOrderFromRequest(r)}>{uiText("Create PO")}</Button></TableCell>
            </TableRow>)}
          </TableBody></Table>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>{uiText("3. Purchase Orders")}</CardTitle></CardHeader>
      <CardContent>
        {loading ? <TableSkeleton cols={6} /> : <Table><TableHeader><TableRow><TableHead>{uiText("PO #")}</TableHead><TableHead>{uiText("Vendor")}</TableHead><TableHead>{uiText("Status")}</TableHead><TableHead>{uiText("Bill")}</TableHead><TableHead>{uiText("Received")}</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
          {orders.map((o) => <TableRow key={o.id}>
            <TableCell>{o.poNumber}</TableCell><TableCell>{o.vendor}</TableCell>
            <TableCell><Badge variant={STATUS_VARIANT[o.status] ?? "outline"}>{o.status}</Badge></TableCell>
            <TableCell>{o.billUploadedAt ? uiText("Uploaded") : <BillUploadInline id={o.id} onDone={load} />}</TableCell>
            <TableCell>{o.materialReceivedAt ? uiText("Yes") : (o.billUploadedAt || true) && <Button size="sm" variant="outline" disabled={busy} onClick={() => receivePo(o.id)}>{uiText("Receive Material")}</Button>}</TableCell>
            <TableCell><InvoiceInline po={o} canPay={canPay} onApprovePayment={approvePayment} onMarkPaid={markPaid} onDone={load} busy={busy} uiText={uiText} /></TableCell>
          </TableRow>)}
        </TableBody></Table>}
        {!loading && !orders.length && <p className="text-sm text-muted-foreground">{uiText("No Central purchase orders yet.")}</p>}
      </CardContent>
    </Card>

    {openGrns.length > 0 && <Card>
      <CardHeader><CardTitle>{uiText("4. Quality check — material received, awaiting decision")}</CardTitle></CardHeader>
      <CardContent>
        {openGrns.map((g) => <div key={g.id} className="mb-3 rounded border p-3">
          <p className="mb-2 text-sm font-medium">{uiText("Received by")}: {g.receivedBy}</p>
          <ul className="mb-2 text-sm text-muted-foreground">{g.lines.map((l) => <li key={l.id}>{l.name} ({l.unit}) — {uiText("ordered")} {l.qtyOrdered}, {uiText("received")} {l.qtyReceived}</li>)}</ul>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => recordQuality(g.id, "PASS")}>{uiText("PASS — credit stock")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => recordQuality(g.id, "FAIL")}>{uiText("FAIL")}</Button>
          </div>
        </div>)}
      </CardContent>
    </Card>}
  </section>;
}

function BillUploadInline({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { const fd = new FormData(); fd.append("bill", file); await fetch(`/api/central-purchase/orders/${id}/bill/upload`, { method: "POST", body: fd, credentials: "include" }); onDone(); }
    finally { setBusy(false); }
  }
  return <label className="text-xs underline cursor-pointer">{busy ? "…" : "Upload bill"}<input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy} onChange={upload} /></label>;
}

function InvoiceInline({ po, canPay, onApprovePayment, onMarkPaid, onDone, busy, uiText }: {
  po: PoRow; canPay: boolean; busy: boolean; uiText: (en: string, hi?: string) => string;
  onApprovePayment: (id: string) => void; onMarkPaid: (id: string) => void; onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [match, setMatch] = React.useState<{ paymentStatus: string; matched: boolean } | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (po.materialReceivedAt) void requestJson<{ invoice: unknown; match: { paymentStatus: string; matched: boolean } | null }>(`/api/central-purchase/orders/${po.id}/invoice`).then((d) => setMatch(d.match)).catch(() => {}); }, [po.id, po.materialReceivedAt]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { const fd = new FormData(); fd.append("invoiceNumber", invoiceNumber); fd.append("amount", amount); await fetch(`/api/central-purchase/orders/${po.id}/invoice`, { method: "POST", body: fd, credentials: "include" }); setOpen(false); onDone(); }
    finally { setSaving(false); }
  }

  if (!po.materialReceivedAt) return <span className="text-xs text-muted-foreground">{uiText("Receive material first")}</span>;
  if (!match) return open ? <form onSubmit={submit} className="flex gap-1">
    <input required placeholder={uiText("Invoice #")} className="w-20 rounded border px-1 text-xs" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
    <input required type="number" step="0.01" placeholder={uiText("Amount")} className="w-20 rounded border px-1 text-xs" value={amount} onChange={(e) => setAmount(e.target.value)} />
    <Button size="sm" type="submit" disabled={saving}>{uiText("Save")}</Button>
  </form> : <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{uiText("Record invoice")}</Button>;

  if (match.paymentStatus === "THREE_WAY_LOCKED") return <Badge variant="destructive">{uiText("3-way mismatch")}</Badge>;
  if (match.paymentStatus === "PENDING" && canPay) return <Button size="sm" disabled={busy} onClick={() => onApprovePayment(po.id)}>{uiText("Approve payment")}</Button>;
  if (match.paymentStatus === "APPROVED" && canPay) return <Button size="sm" disabled={busy} onClick={() => onMarkPaid(po.id)}>{uiText("Mark paid")}</Button>;
  return <Badge variant={match.paymentStatus === "PAID" ? "success" : "outline"}>{match.paymentStatus}</Badge>;
}
