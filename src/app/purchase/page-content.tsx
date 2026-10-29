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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { formatInr } from "@/lib/utils";
import { Plus, Check, X, Upload, PackageCheck, FlaskConical, Trash2 } from "lucide-react";
import { requestJson, RequestJsonError } from "@/lib/current-user";
import { useBranches } from "@/lib/current-branch";

interface RawMaterialOption { id: string; name: string; unit: string; }
interface VendorOption { id: string; name: string; }
interface IndentLineInput { rawMaterialId: string; qty: string; }
interface ApprovedIndentOption { id: string; branchId: string; lines: { rawMaterialId: string; qty: string; name: string; unit: string }[]; }

interface IndentRow {
  id: string;
  branchId: string;
  branch: string;
  raisedById: string;
  raisedBy: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PO_RAISED";
  spikePercent: string | null;
  lineCount: number;
  createdAt: string;
}

interface PurchaseOrderLineApi { rawMaterialId: string | null; itemDescription: string; qty: string; rate: string; }
interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  branchId: string;
  branch: string;
  vendorId: string;
  vendor: string;
  indentId: string | null;
  isGeneralPurchase: boolean;
  status: "CREATED" | "SENT" | "DISPATCHED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED";
  boughtAt: string | null;
  pdfUrl: string;
  billUploadedAt: string | null;
  materialReceivedAt: string | null;
  createdAt: string;
  lines: PurchaseOrderLineApi[];
}

interface GrnRow {
  id: string;
  poId: string;
  poNumber: string;
  branchId: string;
  branch: string;
  status: "PENDING" | "RECEIVED" | "QUALITY_HOLD" | "APPROVED";
  qualityResult: "PENDING" | "PASS" | "FAIL" | "PARTIAL";
  receivedById: string;
  receivedBy: string;
  createdAt: string;
  rawMaterialId: string | null;
  uom: string;
  qtyReceived: number;
  qtyFailed: number;
  inventoryPosted?: boolean;
}

const INDENT_VARIANT: Record<string, "secondary" | "warning" | "success" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  PO_RAISED: "outline",
};

function errMsg(err: unknown, fallback: string) {
  return err instanceof RequestJsonError ? err.message : err instanceof Error ? err.message : fallback;
}

export default function PurchasePage() {
  const uiText = useUiCopy();
  const { branches } = useBranches();
  const [materials, setMaterials] = React.useState<RawMaterialOption[]>([]);
  const [vendors, setVendors] = React.useState<VendorOption[]>([]);
  const [approvedIndents, setApprovedIndents] = React.useState<ApprovedIndentOption[]>([]);
  const [indents, setIndents] = React.useState<IndentRow[]>([]);
  const [pos, setPos] = React.useState<PurchaseOrderRow[]>([]);
  const [grns, setGrns] = React.useState<GrnRow[]>([]);
  const [loadError, setLoadError] = React.useState("");
  const { notify, ToastHost } = useToast();

  const loadIndents = React.useCallback(() => {
    requestJson<{ indents: IndentRow[] }>("/api/purchase/indents").then((data) => setIndents(data.indents)).catch((err) => setLoadError(errMsg(err, "Could not load indents")));
  }, []);
  const loadApprovedIndents = React.useCallback(() => {
    requestJson<{ indents: ApprovedIndentOption[] }>("/api/purchase/orders/approved-indents").then((data) => setApprovedIndents(data.indents)).catch((err) => { setApprovedIndents([]); setLoadError(errMsg(err, "Could not load approved indents")); });
  }, []);
  const loadOrders = React.useCallback(() => {
    requestJson<{ purchaseOrders: PurchaseOrderRow[] }>("/api/purchase/orders").then((data) => setPos(data.purchaseOrders)).catch((err) => setLoadError(errMsg(err, "Could not load purchase orders")));
  }, []);
  const loadGrns = React.useCallback(() => {
    requestJson<{ grns: GrnRow[] }>("/api/purchase/grns").then((data) => setGrns(data.grns)).catch((err) => setLoadError(errMsg(err, "Could not load GRNs")));
  }, []);

  React.useEffect(() => {
    requestJson<{ rawMaterials: RawMaterialOption[] }>("/api/raw-materials").then((data) => setMaterials(data.rawMaterials)).catch(() => setMaterials([]));
    requestJson<{ vendors: VendorOption[] }>("/api/purchase/vendors").then((data) => setVendors(data.vendors)).catch(() => setVendors([]));
    loadIndents();
    loadApprovedIndents();
    loadOrders();
    loadGrns();
  }, [loadIndents, loadApprovedIndents, loadOrders, loadGrns]);

  const [raiseOpen, setRaiseOpen] = React.useState(false);
  const [poOpen, setPoOpen] = React.useState(false);
  const [qualityGrn, setQualityGrn] = React.useState<GrnRow | null>(null);
  const [qualityResult, setQualityResult] = React.useState<"PASS" | "FAIL" | "PARTIAL">("PASS");
  const [failQty, setFailQty] = React.useState("");
  const [qualityBusy, setQualityBusy] = React.useState(false);
  const [qualityError, setQualityError] = React.useState("");
  const [indentBusy, setIndentBusy] = React.useState(false);
  const [poBusy, setPoBusy] = React.useState(false);
  const [rowBusyId, setRowBusyId] = React.useState<string | null>(null);

  const [indentForm, setIndentForm] = React.useState<{ branchId: string; lines: IndentLineInput[] }>({
    branchId: "",
    lines: [{ rawMaterialId: "", qty: "" }],
  });
  const [poForm, setPoForm] = React.useState({
    isGeneral: false,
    branchId: "",
    vendorId: "",
    itemDescription: "",
    indentId: "",
    rates: {} as Record<number, string>,
    rate: "",
  });

  function addIndentLine() {
    setIndentForm((prev) => ({ ...prev, lines: [...prev.lines, { rawMaterialId: "", qty: "" }] }));
  }
  function removeIndentLine(index: number) {
    setIndentForm((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== index) }));
  }
  function updateIndentLine(index: number, field: keyof IndentLineInput, value: string) {
    setIndentForm((prev) => ({ ...prev, lines: prev.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)) }));
  }
  const indentLinesValid = indentForm.lines.length > 0 && indentForm.lines.every((l) => l.rawMaterialId && Number(l.qty) > 0);

  async function raiseIndent() {
    if (!indentForm.branchId || !indentLinesValid) return;
    setIndentBusy(true);
    try {
      await requestJson("/api/purchase/indents", {
        method: "POST",
        body: JSON.stringify({ branchId: indentForm.branchId, lines: indentForm.lines.map((l) => ({ rawMaterialId: l.rawMaterialId, qty: l.qty })) }),
      });
      notify(uiText("Indent raised as DRAFT. Submit it for approval next.", "Indent DRAFT ke roop mein bani. Ab approval ke liye submit karo."));
      setIndentForm({ branchId: "", lines: [{ rawMaterialId: "", qty: "" }] });
      setRaiseOpen(false);
      loadIndents();
    } catch (err) {
      notify(uiText(errMsg(err, "Could not raise indent.")));
    } finally {
      setIndentBusy(false);
    }
  }

  async function submitIndentForApproval(id: string) {
    setRowBusyId(id);
    try {
      await requestJson(`/api/purchase/indents/${id}/submit`, { method: "POST", body: JSON.stringify({}) });
      notify(uiText("Indent submitted for approval.", "Indent approval ke liye submit hui."));
      loadIndents();
    } catch (err) {
      notify(uiText(errMsg(err, "Could not submit indent.")));
    } finally {
      setRowBusyId(null);
    }
  }
  async function approveIndent(id: string) {
    setRowBusyId(id);
    try {
      await requestJson(`/api/purchase/indents/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
      notify(uiText("Indent approved. A Purchase Order can now be raised against it.", "Indent approve hui. Ab iske against PO raise ho sakta hai."));
      loadIndents();
      loadApprovedIndents();
    } catch (err) {
      notify(uiText(errMsg(err, "Could not approve indent.")));
    } finally {
      setRowBusyId(null);
    }
  }
  async function rejectIndent(id: string) {
    setRowBusyId(id);
    try {
      await requestJson(`/api/purchase/indents/${id}/reject`, { method: "POST", body: JSON.stringify({}) });
      notify(uiText("Indent rejected.", "Indent reject hui."));
      loadIndents();
    } catch (err) {
      notify(uiText(errMsg(err, "Could not reject indent.")));
    } finally {
      setRowBusyId(null);
    }
  }

  const selectedIndent = approvedIndents.find((i) => i.id === poForm.indentId && i.branchId === poForm.branchId);
  const validRate = (value: string | undefined) => value !== undefined && /^\d{1,8}(\.\d{1,2})?$/.test(value);
  const poFormValid = !!(
    poForm.branchId.trim() && poForm.vendorId.trim() &&
    (poForm.isGeneral ? poForm.itemDescription.trim() && validRate(poForm.rate) :
      selectedIndent && selectedIndent.lines.length > 0 && selectedIndent.lines.every((_, index) => validRate(poForm.rates[index])))
  );

  async function addPurchase() {
    if (!poFormValid) return;
    setPoBusy(true);
    try {
      const lines = poForm.isGeneral
        ? [{ itemDescription: poForm.itemDescription.trim(), qty: "1", rate: poForm.rate }]
        : selectedIndent!.lines.map((line, index) => ({ rawMaterialId: line.rawMaterialId, qty: line.qty, rate: poForm.rates[index] }));
      const result = await requestJson<{ purchaseOrder: { poNumber: string } }>("/api/purchase/orders", {
        method: "POST",
        body: JSON.stringify({ branchId: poForm.branchId, vendorId: poForm.vendorId, isGeneralPurchase: poForm.isGeneral, ...(!poForm.isGeneral ? { indentId: poForm.indentId } : {}), lines }),
      });
      notify(uiText(`${result.purchaseOrder.poNumber} created (Step 1: Buy).`, `${result.purchaseOrder.poNumber} bana (Step 1: Buy).`));
      setPoForm({ isGeneral: false, branchId: "", vendorId: "", itemDescription: "", indentId: "", rates: {}, rate: "" });
      setPoOpen(false);
      loadOrders();
      loadIndents();
      loadApprovedIndents();
    } catch (err) {
      notify(uiText(errMsg(err, "Could not create purchase order.")));
    } finally {
      setPoBusy(false);
    }
  }

  async function markBillUploaded(po: PurchaseOrderRow) {
    setRowBusyId(po.id);
    try {
      await requestJson(`/api/purchase/orders/${po.id}/bill`, { method: "POST", body: JSON.stringify({}) });
      notify(uiText(`${po.poNumber} — bill step marked complete (text/URL field only, no file-upload pipeline yet).`, `${po.poNumber} — bill step complete mark hua (abhi text/URL field hi, file upload pipeline nahi hai).`));
      loadOrders();
    } catch (err) {
      notify(uiText(errMsg(err, "Could not mark bill uploaded.")));
    } finally {
      setRowBusyId(null);
    }
  }

  async function markMaterialReceived(po: PurchaseOrderRow) {
    setRowBusyId(po.id);
    try {
      const result = await requestJson<{ grn: { id: string } }>(`/api/purchase/orders/${po.id}/receive`, { method: "POST", body: JSON.stringify({}) });
      notify(uiText(`${po.poNumber}: material received, GRN ${result.grn.id} created. Try Quality Check.`, `${po.poNumber}: material receive hua, GRN ${result.grn.id} bana. Quality Check try karo.`));
      loadOrders();
      loadGrns();
    } catch (err) {
      notify(uiText(errMsg(err, "Could not mark material received.")));
    } finally {
      setRowBusyId(null);
    }
  }

  function openQualityCheck(grn: GrnRow) {
    setQualityGrn(grn);
    setQualityResult("PASS");
    setFailQty("");
    setQualityError("");
  }

  async function submitQualityCheck() {
    if (!qualityGrn) return;
    const failedQty = qualityResult === "PASS" ? 0 : Number(failQty) || 0;
    if (qualityResult !== "PASS" && failedQty <= 0) return;
    const totalQty = qualityGrn.qtyReceived ?? 0;
    const passQty = qualityResult === "PASS" ? totalQty : qualityResult === "PARTIAL" ? Math.max(0, totalQty - failedQty) : 0;
    const canPostToInventory = passQty > 0 && !!qualityGrn.branchId && !!qualityGrn.rawMaterialId;

    setQualityError("");
    setQualityBusy(true);
    try {
      let posted = false;
      let newQtyOnHand: string | undefined;
      if (canPostToInventory) {
        const result = await requestJson<{ item: { qtyOnHand: string; unit: string } }>("/api/inventory/receive", {
          method: "POST",
          body: JSON.stringify({ branchId: qualityGrn.branchId, rawMaterialId: qualityGrn.rawMaterialId, qty: passQty }),
        });
        posted = true;
        newQtyOnHand = result.item.qtyOnHand;
      }
      setGrns((prev) =>
        prev.map((g) =>
          g.id === qualityGrn.id
            ? { ...g, qualityResult, qtyFailed: failedQty, inventoryPosted: posted, status: qualityResult === "FAIL" ? "QUALITY_HOLD" : "APPROVED" }
            : g
        )
      );
      if (posted) {
        notify(uiText(
          `${qualityGrn.id}: Quality ${qualityResult}. ${passQty} ${qualityGrn.uom} posted to real Inventory — new on-hand ${newQtyOnHand} ${qualityGrn.uom}.`,
          `${qualityGrn.id}: Quality ${qualityResult}. ${passQty} ${qualityGrn.uom} real Inventory mein post hua — naya on-hand ${newQtyOnHand} ${qualityGrn.uom}.`
        ));
      } else if (qualityResult === "PASS") {
        notify(uiText(`${qualityGrn.id}: Quality PASS, but this GRN has no linked raw material (general purchase), so nothing was posted to Inventory.`, `${qualityGrn.id}: Quality PASS, lekin is GRN ka koi linked raw material nahi hai (general purchase), isliye Inventory mein kuchh post nahi hua.`));
      } else {
        notify(uiText(`${qualityGrn.id}: ${qualityResult}, failed ${failedQty} ${qualityGrn.uom}. No vendor return or Accounts refund entry was posted (demo only).`, `${qualityGrn.id}: ${qualityResult}, failed ${failedQty} ${qualityGrn.uom}. Vendor return ya Accounts refund entry post nahi hua (demo hi hai).`));
      }
      setQualityGrn(null);
    } catch (err) {
      setQualityError(errMsg(err, "Could not post to Inventory. Quality result was not saved."));
    } finally {
      setQualityBusy(false);
    }
  }

  return (
    <AppShell activeHref="/purchase">
      <PageHeader
        title={uiText("Purchase & GRN")}
        description={uiText("Indent → Manager Approval → Purchase (Buy → Bill Upload (optional) → Material Receive) → Quality Check → Inventory.")}
      >
        <Dialog open={poOpen} onOpenChange={(open) => { if (!poBusy) { setPoOpen(open); if (open) loadApprovedIndents(); } }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus /> {uiText(" New Purchase ")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{uiText("New Purchase")}</DialogTitle>
              <DialogDescription>
                {uiText(" Store-related material ya general (non-store) item — dono same 3-step flow follow karte hain. ")}</DialogDescription>
            </DialogHeader>
            <fieldset disabled={poBusy} className="space-y-3">
              {loadError && <p role="alert" className="text-sm text-destructive">{uiText(loadError)}</p>}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={poForm.isGeneral}
                  onChange={(e) => setPoForm({ ...poForm, isGeneral: e.target.checked, indentId: "", rates: {} })}
                />
                {uiText(" General purchase (store/raw-material se related nahi — no Indent needed) ")}</label>
              <Field label={uiText("Branch")}>
                <select
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={poForm.branchId}
                  onChange={(e) => setPoForm({ ...poForm, branchId: e.target.value, indentId: "", rates: {} })}
                >
                  <option value="">{uiText("Select branch (required)")}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={uiText("Vendor")}>
                <select
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={poForm.vendorId}
                  onChange={(e) => setPoForm({ ...poForm, vendorId: e.target.value })}
                >
                  <option value="">{uiText("Select vendor (required)")}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </Field>
              {poForm.isGeneral ? (
                <Field label={uiText("Item description")}>
                  <input
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={poForm.itemDescription}
                    onChange={(e) => setPoForm({ ...poForm, itemDescription: e.target.value })}
                    placeholder={uiText("Office chair repair")}
                  />
                </Field>
              ) : (
                <>
                  <Field label={uiText("Approved indent", "Approved indent")}>
                    <select
                      aria-label={uiText("Approved indent", "Approved indent")}
                      className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                      value={poForm.indentId}
                      disabled={!poForm.branchId}
                      onChange={(e) => setPoForm({ ...poForm, indentId: e.target.value, rates: {} })}
                    >
                      <option value="">{uiText("Select an approved indent", "Approved indent chuno")}</option>
                      {approvedIndents.filter((i) => i.branchId === poForm.branchId).map((i) => (
                        <option key={i.id} value={i.id}>{i.id.slice(0, 8)} — {i.lines.length} {uiText("lines", "lines")}</option>
                      ))}
                    </select>
                  </Field>
                  <p className="text-xs text-muted-foreground">{uiText("Store purchases require an approved indent. All approved materials and quantities are locked; enter a rate for each line.", "Store purchase ke liye approved indent zaroori hai. Approved materials aur quantities locked hain; har line ka rate bharo.")}</p>
                  {selectedIndent?.lines.map((line, index) => (
                    <div key={index} className="grid min-w-0 gap-2 rounded-md border p-3 sm:grid-cols-2">
                      <p className="min-w-0 break-words text-sm">{line.name} — {line.qty} {line.unit}</p>
                      <Field label={uiText("Rate (₹ per unit)")}>
                        <input
                          type="number" min="0" step="0.01"
                          aria-label={`Rate for ${line.name}`}
                          className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                          value={poForm.rates[index] ?? ""}
                          onChange={(e) => setPoForm((prev) => ({ ...prev, rates: { ...prev.rates, [index]: e.target.value } }))}
                        />
                      </Field>
                    </div>
                  ))}
                </>
              )}
              {poForm.isGeneral && <Field label={uiText("Amount (₹)")}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={poForm.rate}
                  onChange={(e) => setPoForm({ ...poForm, rate: e.target.value })}
                  placeholder={uiText("9400")}
                />
              </Field>}
            </fieldset>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPoOpen(false)} disabled={poBusy}>
                {uiText(" Cancel ")}</Button>
              <Button onClick={addPurchase} disabled={poBusy || !poFormValid}>
                {poBusy ? uiText(" Creating… ") : uiText(" Create (Step 1: Buy) ")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> {uiText(" Raise Indent ")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{uiText("Raise Indent")}</DialogTitle>
              <DialogDescription>{uiText("Draft indent create hota hai — manager approval ke baad hi Purchase mein show hota hai.")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label={uiText("Branch")}>
                <select
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={indentForm.branchId}
                  onChange={(e) => setIndentForm({ ...indentForm, branchId: e.target.value })}
                >
                  <option value="">{uiText("Select branch (required)")}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </Field>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">{uiText("Line items (1–50)")}</label>
                {indentForm.lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="flex-1 rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                      value={line.rawMaterialId}
                      onChange={(e) => updateIndentLine(i, "rawMaterialId", e.target.value)}
                    >
                      <option value="">{uiText("Select material")}</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      className="w-28 rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                      value={line.qty}
                      onChange={(e) => updateIndentLine(i, "qty", e.target.value)}
                      placeholder={uiText("Qty")}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={indentForm.lines.length <= 1}
                      onClick={() => removeIndentLine(i)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={addIndentLine} disabled={indentForm.lines.length >= 50}>
                  <Plus className="size-3.5" /> {uiText(" Add line ")}</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRaiseOpen(false)} disabled={indentBusy}>
                {uiText(" Cancel ")}</Button>
              <Button onClick={raiseIndent} disabled={indentBusy || !indentForm.branchId || !indentLinesValid}>
                {indentBusy ? uiText(" Raising… ") : uiText(" Raise ")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Tabs defaultValue="indents">
        <TabsList>
          <TabsTrigger value="indents">{uiText("Indents")}</TabsTrigger>
          <TabsTrigger value="pos">{uiText("Purchase Orders")}</TabsTrigger>
          <TabsTrigger value="grns">{uiText("GRN / Quality")}</TabsTrigger>
        </TabsList>

        <TabsContent value="indents">
          <Card>
            <CardContent className="pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiText("Indent")}</TableHead>
                    <TableHead>{uiText("Branch")}</TableHead>
                    <TableHead>{uiText("Raised By")}</TableHead>
                    <TableHead>{uiText("Lines")}</TableHead>
                    <TableHead>{uiText("Spike vs Avg")}</TableHead>
                    <TableHead>{uiText("Status")}</TableHead>
                    <TableHead>{uiText("Manager Action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indents.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.id.slice(0, 8)}</TableCell>
                      <TableCell>{i.branch}</TableCell>
                      <TableCell>{i.raisedBy}</TableCell>
                      <TableCell>{i.lineCount}</TableCell>
                      <TableCell>
                        {i.spikePercent != null ? (
                          <Badge variant={Number(i.spikePercent) > 25 ? "destructive" : "outline"}>+{Number(i.spikePercent).toFixed(1)}%</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={INDENT_VARIANT[i.status]}>{i.status.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="space-x-1">
                        {i.status === "DRAFT" && (
                          <Button size="sm" variant="outline" disabled={rowBusyId === i.id} onClick={() => submitIndentForApproval(i.id)}>
                            {uiText(" Submit for Approval ")}</Button>
                        )}
                        {i.status === "PENDING_APPROVAL" && (
                          <>
                            <Button size="sm" variant="outline" disabled={rowBusyId === i.id} onClick={() => approveIndent(i.id)}>
                              <Check className="size-3.5 text-success" /> {uiText(" Approve ")}</Button>
                            <Button size="sm" variant="outline" disabled={rowBusyId === i.id} onClick={() => rejectIndent(i.id)}>
                              <X className="size-3.5 text-destructive" /> {uiText(" Reject ")}</Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pos">
          <Card>
            <CardContent className="pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiText("PO Number")}</TableHead>
                    <TableHead>{uiText("Branch")}</TableHead>
                    <TableHead>{uiText("Vendor")}</TableHead>
                    <TableHead>{uiText("Type")}</TableHead>
                    <TableHead>{uiText("Amount")}</TableHead>
                    <TableHead>{uiText("Step Progress")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pos.map((p) => {
                    const amountInr = p.lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.rate), 0);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.poNumber}</TableCell>
                        <TableCell>{p.branch}</TableCell>
                        <TableCell>{p.vendor}</TableCell>
                        <TableCell>
                          <Badge variant={p.isGeneralPurchase ? "outline" : "secondary"}>
                            {p.isGeneralPurchase ? uiText("General") : uiText("Store")}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatInr(amountInr)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="success">{uiText("1. Bought")}</Badge>
                            {p.billUploadedAt ? (
                              <Badge variant="success">{uiText("2. Bill ✓")}</Badge>
                            ) : (
                              <Button size="sm" variant="outline" disabled={rowBusyId === p.id} onClick={() => markBillUploaded(p)}>
                                <Upload className="size-3.5" /> {uiText(" Upload Bill (optional) ")}</Button>
                            )}
                            {p.materialReceivedAt ? (
                              <Badge variant="success">{uiText("3. Received ✓")}</Badge>
                            ) : (
                              <Button size="sm" disabled={rowBusyId === p.id} onClick={() => markMaterialReceived(p)}>
                                <PackageCheck className="size-3.5" /> {uiText(" Mark Material Received ")}</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grns">
          <Card>
            <CardContent className="pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiText("GRN")}</TableHead>
                    <TableHead>{uiText("PO Number")}</TableHead>
                    <TableHead>{uiText("Branch")}</TableHead>
                    <TableHead>{uiText("Received By")}</TableHead>
                    <TableHead>{uiText("Quality Result")}</TableHead>
                    <TableHead>{uiText("Fail Qty")}</TableHead>
                    <TableHead>{uiText("Inventory")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grns.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.id.slice(0, 8)}</TableCell>
                      <TableCell>{g.poNumber}</TableCell>
                      <TableCell>{g.branch}</TableCell>
                      <TableCell>{g.receivedBy}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            g.qualityResult === "PASS"
                              ? "success"
                              : g.qualityResult === "FAIL"
                                ? "destructive"
                                : g.qualityResult === "PARTIAL"
                                  ? "warning"
                                  : "secondary"
                          }
                        >
                          {g.qualityResult}
                        </Badge>
                      </TableCell>
                      <TableCell>{g.qtyFailed > 0 ? `${g.qtyFailed} ${g.uom}` : "—"}</TableCell>
                      <TableCell>
                        {g.inventoryPosted ? (
                          <Badge variant="success">{uiText("Posted ✓")}</Badge>
                        ) : g.qualityResult === "PENDING" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge variant="outline">{uiText("Not posted")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {g.qualityResult === "PENDING" && (
                          <Button size="sm" variant="outline" onClick={() => openQualityCheck(g)}>
                            <FlaskConical className="size-3.5" /> {uiText(" Quality Check ")}</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quality check dialog — PASS/PARTIAL post the passed qty to real Inventory; FAIL/PARTIAL fail-qty is demo-only return+refund */}
      <Dialog open={!!qualityGrn} onOpenChange={(open) => !open && !qualityBusy && setQualityGrn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText("Quality Check — ")}{qualityGrn?.id.slice(0, 8)}</DialogTitle>
            <DialogDescription>
              {qualityGrn?.rawMaterialId
                ? uiText(" Pass/Partial → passed quantity posts to the real Inventory table right now. Fail/Partial fail-qty return + Accounts refund entry is still demo-only. ", " Pass/Partial → passed quantity turant real Inventory table mein post hoti hai. Fail/Partial ki fail-qty return + Accounts refund entry abhi bhi demo hi hai. ")
                : uiText(" This GRN is a general purchase with no linked raw material — nothing will post to Inventory. ", " Ye GRN ek general purchase hai, koi linked raw material nahi — Inventory mein kuchh post nahi hoga. ")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {qualityError && <p role="alert" className="text-sm text-destructive">{uiText(qualityError)}</p>}
            <fieldset disabled={qualityBusy} className="space-y-3">
              <div className="flex gap-2">
                {(["PASS", "PARTIAL", "FAIL"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setQualityResult(opt)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                      qualityResult === opt ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {qualityResult !== "PASS" && (
                <Field label={uiText(`Fail quantity (${qualityGrn?.uom ?? "UOM"})`, `Fail quantity (${qualityGrn?.uom ?? "UOM"})`)}>
                  <input
                    type="number"
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={failQty}
                    onChange={(e) => setFailQty(e.target.value)}
                    placeholder={uiText("2.5")}
                  />
                </Field>
              )}
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQualityGrn(null)} disabled={qualityBusy}>
              {uiText(" Cancel ")}</Button>
            <Button onClick={submitQualityCheck} disabled={qualityBusy || (qualityResult !== "PASS" && !failQty.trim())}>
              {qualityBusy ? uiText(" Submitting… ") : uiText(" Submit ")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastHost />
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
