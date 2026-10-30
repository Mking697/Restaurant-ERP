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
import { Plus, Check, X, Upload, PackageCheck, Trash2 } from "lucide-react";
import { requestJson, RequestJsonError, useCurrentUser, type CurrentUser } from "@/lib/current-user";
import { useBranches } from "@/lib/current-branch";
import { VendorReturnsPanel } from "@/components/vendor-returns-panel";

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

interface GrnLine {
  id: string; rawMaterialId: string | null; name: string; itemDescription: string; unit: string;
  qtyOrdered: string; qtyReceived: string; qtyFailed: string; qtyAccepted: string; rateOrdered: string;
}
interface GrnRow {
  id: string; poNumber: string; branchId: string; branch: string; receivedBy: string;
  status: string; qualityResult: "PENDING" | "PASS" | "FAIL" | "PARTIAL";
  isGeneralPurchase: boolean; lines: GrnLine[]; qualityNote: string | null; qualityPhotoUrl: string | null;
  qualityRecorded: boolean; qualityReady: boolean; reconciliationRequired: boolean; inventoryPosted: boolean; qualityRecordedAt: string | null;
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
  const [grnRefresh, setGrnRefresh] = React.useState(0);
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
    setGrnRefresh((value) => value + 1);
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

  const actor = useCurrentUser();
  const purchaseAllowed = actor.ready && actor.authenticated && !actor.error && (actor.role === "SUPER_ADMIN" || actor.moduleAccess.includes("PURCHASE_ORDER"));
  const rawLookupScope = JSON.stringify([actor.id, actor.ready, actor.authenticated, actor.error, actor.role, actor.branchId, [...actor.moduleAccess].sort(), poOpen, poForm.branchId, poForm.isGeneral]);
  const lookupContext = React.useRef({ raw: rawLookupScope, epoch: 0 });
  if (lookupContext.current.raw !== rawLookupScope) lookupContext.current = { raw: rawLookupScope, epoch: lookupContext.current.epoch + 1 };
  const lookupScope = JSON.stringify([rawLookupScope, lookupContext.current.epoch]);
  const lookupLive = React.useRef(lookupScope);
  const lookupVersion = React.useRef(0);
  const lookupAlive = React.useRef(true);
  const lookupPending = React.useRef(false);
  if (lookupLive.current !== lookupScope) { lookupVersion.current++; lookupPending.current = false; lookupLive.current = lookupScope; }
  const lookupFeedbackScope = React.useRef(lookupScope);
  const [indentLookupId, setIndentLookupId] = React.useState("");
  const [indentLookup, setIndentLookup] = React.useState<{ scope: string; indent: ApprovedIndentOption } | null>(null);
  const [indentLookupBusy, setIndentLookupBusy] = React.useState(false);
  const [indentLookupError, setIndentLookupError] = React.useState("");
  React.useEffect(() => { lookupAlive.current = true; return () => { lookupAlive.current = false; lookupVersion.current++; }; }, []);
  function clearIndentLookup() {
    lookupFeedbackScope.current = lookupScope; lookupVersion.current++; lookupPending.current = false;
    setIndentLookup(null); setIndentLookupBusy(false); setIndentLookupError("");
  }
  const historicalIndent = indentLookup?.scope === lookupScope ? indentLookup.indent : null;
  const indentChoices = historicalIndent ? [historicalIndent, ...approvedIndents.filter(i => i.id !== historicalIndent.id)] : approvedIndents;
  const lookupRenderVersion = lookupVersion.current;
  const lookupBusy = indentLookupBusy && lookupPending.current && lookupFeedbackScope.current === lookupScope;
  async function lookupApprovedIndent() {
    if (!purchaseAllowed || !poOpen || poBusy || poForm.isGeneral || !poForm.branchId || lookupLive.current !== lookupScope || lookupPending.current || lookupRenderVersion !== lookupVersion.current) return;
    clearIndentLookup();
    setPoForm(prev => ({ ...prev, indentId: "", rates: {} }));
    const id = indentLookupId;
    if (!id.length || id.length > 200 || id.trim() !== id || /[\u0000-\u001f\u007f]/.test(id)) { setIndentLookupError(uiText("Enter the full indent ID.", "Poora indent ID bharo.")); return; }
    const token = ++lookupVersion.current;
    lookupPending.current = true; setIndentLookupBusy(true);
    const current = () => lookupAlive.current && lookupLive.current === lookupScope && token === lookupVersion.current;
    try {
      const data = await requestJson<{ indent: ApprovedIndentOption }>(`/api/purchase/orders/approved-indents/${encodeURIComponent(id)}?${new URLSearchParams({ branchId: poForm.branchId })}`);
      if (!current()) return;
      const row = data?.indent;
      if (!row || row.id !== id || row.branchId !== poForm.branchId || !Array.isArray(row.lines) || !row.lines.length || row.lines.length > 50 || row.lines.some(line => !line || typeof line.rawMaterialId !== "string" || !line.rawMaterialId || typeof line.qty !== "string" || !/^\d{1,9}(?:\.\d{1,3})?$/.test(line.qty) || Number(line.qty) <= 0 || typeof line.name !== "string" || typeof line.unit !== "string")) throw new Error("Invalid approved indent");
      setIndentLookup({ scope: lookupScope, indent: row });
      setPoForm(prev => ({ ...prev, indentId: row.id, rates: {} }));
    } catch { if (current()) setIndentLookupError(uiText("Approved indent not found or lookup failed. Check the full ID and selected branch.", "Approved indent nahi mili ya lookup fail hua. Poora ID aur selected branch check karo.")); }
    finally { if (current()) { lookupPending.current = false; setIndentLookupBusy(false); } }
  }
  const selectedIndent = indentChoices.find((i) => i.id === poForm.indentId && i.branchId === poForm.branchId && (!indentLookup || indentLookup.scope === lookupScope));
  const validRate = (value: string | undefined) => value !== undefined && /^\d{1,8}(\.\d{1,2})?$/.test(value);
  const poFormValid = !!(
    purchaseAllowed && !lookupBusy && poForm.branchId.trim() && poForm.vendorId.trim() &&
    (poForm.isGeneral ? poForm.itemDescription.trim() && validRate(poForm.rate) :
      selectedIndent && selectedIndent.lines.length > 0 && selectedIndent.lines.every((_, index) => validRate(poForm.rates[index])))
  );

  async function addPurchase() {
    if (!poFormValid || lookupLive.current !== lookupScope || lookupPending.current || lookupRenderVersion !== lookupVersion.current) return;
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


  return (
    <AppShell activeHref="/purchase">
      <PageHeader
        title={uiText("Purchase & GRN")}
        description={uiText("Indent → Manager Approval → Purchase (Buy → Bill Upload (optional) → Material Receive) → Quality Check → Inventory.")}
      >
        <Dialog open={poOpen} onOpenChange={(open) => { if (!poBusy) { clearIndentLookup(); setPoOpen(open); setPoForm(prev => ({ ...prev, indentId: "", rates: {} })); if (open) loadApprovedIndents(); } }}>
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
                  onChange={(e) => { clearIndentLookup(); setPoForm({ ...poForm, isGeneral: e.target.checked, indentId: "", rates: {} }); }}
                />
                {uiText(" General purchase (store/raw-material se related nahi — no Indent needed) ")}</label>
              <Field label={uiText("Branch")}>
                <select
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={poForm.branchId}
                  onChange={(e) => { clearIndentLookup(); setPoForm({ ...poForm, branchId: e.target.value, indentId: "", rates: {} }); }}
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
                  <p className="text-xs text-muted-foreground">{uiText("Latest 200 approved indents only. Use the full ID to look up an older approved indent in this branch.", "Sirf latest 200 approved indents. Is branch ki purani approved indent ke liye poora ID lookup karo.")}</p>
                  <Field label={uiText("Full indent ID", "Poora indent ID")}>
                    <input aria-label="Full indent ID" maxLength={200} value={indentLookupId} className="w-full min-w-0 rounded border p-2" onChange={e => { clearIndentLookup(); setIndentLookupId(e.target.value); setPoForm(prev => ({ ...prev, indentId: "", rates: {} })); }} />
                  </Field>
                  <Button type="button" variant="outline" disabled={!purchaseAllowed || !poOpen || !poForm.branchId || lookupBusy} onClick={lookupApprovedIndent}>{uiText("Look up approved indent", "Approved indent lookup karo")}</Button>
                  {lookupBusy && <p role="status">{uiText("Looking up indent…", "Indent lookup ho rahi hai…")}</p>}
                  {lookupFeedbackScope.current === lookupScope && indentLookupError && <p role="alert">{indentLookupError}</p>}
                  <Field label={uiText("Approved indent", "Approved indent")}>
                    <select
                      aria-label={uiText("Approved indent", "Approved indent")}
                      className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                      value={poForm.indentId}
                      disabled={!poForm.branchId || lookupBusy}
                      onChange={(e) => { if (!lookupPending.current) { setIndentLookupError(""); setPoForm({ ...poForm, indentId: e.target.value, rates: {} }); } }}
                    >
                      <option value="">{uiText("Select an approved indent", "Approved indent chuno")}</option>
                      {indentChoices.filter((i) => i.branchId === poForm.branchId).map((i) => (
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
              {poForm.isGeneral && <Field label={uiText("Amount (TSh)")}>
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
              <Button variant="outline" onClick={() => { clearIndentLookup(); setPoOpen(false); setPoForm(prev => ({ ...prev, indentId: "", rates: {} })); }} disabled={poBusy}>
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
          <TabsTrigger value="vendor-returns">{uiText("Vendor returns", "Vendor returns")}</TabsTrigger>
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
          <GrnQualitySection refreshToken={grnRefresh} />
        </TabsContent>
        <TabsContent value="vendor-returns"><VendorReturnsPanel mode="purchase" /></TabsContent>
      </Tabs>

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

// Keep this independently keyed to live identity/grants; an old dialog cannot
// publish a completion into a newly authorized scope.
function GrnQualitySection({ refreshToken }: { refreshToken: number }) {
  const user = useCurrentUser();
  const scope = JSON.stringify([user.id, user.authenticated, user.ready, user.error, user.role, user.branchId, [...user.moduleAccess].sort()]);
  const live = React.useRef(scope); live.current = scope;
  return <GrnQualityWorkspace key={scope} user={user} refreshToken={refreshToken} isCurrent={() => live.current === scope} />;
}

function GrnQualityWorkspace({ user, refreshToken, isCurrent }: { user: CurrentUser; refreshToken: number; isCurrent: () => boolean }) {
  const uiText = useUiCopy();
  const [grns, setGrns] = React.useState<GrnRow[]>([]);
  const [selected, setSelected] = React.useState<GrnRow | null>(null);
  const [result, setResult] = React.useState<"PASS" | "PARTIAL" | "FAIL">("PASS");
  const [failures, setFailures] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [error, setError] = React.useState("");
  const [loadError, setLoadError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [uncertain, setUncertain] = React.useState(false);
  const alive = React.useRef(true);
  const current = () => alive.current && isCurrent();
  const busyRef = React.useRef(false);
  const generation = React.useRef(0);
  const readVersion = React.useRef(0);
  type Decision = { result: "PASS" | "PARTIAL" | "FAIL"; lines: { id: string; qtyFailed: string }[]; note: string; photoUrl: string };
  const intent = React.useRef<{ grn: GrnRow; body: Decision; serialized: string } | null>(null);
  const allowed = user.ready && user.authenticated && !user.error && (user.role === "SUPER_ADMIN" || user.moduleAccess.includes("PURCHASE_ORDER"));
  const inventoryAllowed = allowed && (user.role === "SUPER_ADMIN" || user.moduleAccess.includes("INVENTORY"));
  const canCheck = (grn: GrnRow) => current() && allowed && (grn.isGeneralPurchase || inventoryAllowed) && grn.qualityReady && !grn.reconciliationRequired && !grn.qualityRecorded && grn.qualityResult === "PENDING";
  const quantity = (value: string) => /^\d{1,12}(?:\.\d{1,3})?$/.test(value) ? BigInt(value.split(".")[0]) * BigInt(1000) + BigInt((value.split(".")[1] ?? "").padEnd(3, "0")) : null;
  const decisionLines = selected?.lines.map(line => ({ id: line.id, qtyFailed: result === "PASS" ? "0" : result === "FAIL" ? line.qtyReceived : failures[line.id] ?? "0" })) ?? [];
  const quantitiesValid = !!selected && selected.lines.length > 0 && selected.lines.length <= 50 && new Set(selected.lines.map(line => line.id)).size === selected.lines.length && decisionLines.every((line, i) => {
    const failed = quantity(line.qtyFailed), received = quantity(selected.lines[i].qtyReceived);
    return failed !== null && received !== null && received > BigInt(0) && failed <= received;
  });
  const partialValid = result !== "PARTIAL" || (decisionLines.some(line => (quantity(line.qtyFailed) ?? BigInt(0)) > BigInt(0)) && decisionLines.some((line, i) => quantity(line.qtyFailed) !== quantity(selected!.lines[i].qtyReceived)));
  const formValid = quantitiesValid && partialValid && note.trim().length <= 1000 && (result === "PASS" || note.trim().length >= 3) && photoUrl.trim().length <= 2000;
  const editable = () => current() && !busyRef.current && !intent.current;
  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current++; readVersion.current++; };
  }, []);
  React.useEffect(() => {
    let active = true;
    const version = ++readVersion.current;
    if (allowed) void requestJson<{ grns: GrnRow[] }>("/api/purchase/grns").then(data => {
      if (active && current() && version === readVersion.current && !intent.current) { setGrns(data.grns); setLoadError(""); }
    }).catch(err => { if (active && current() && version === readVersion.current) setLoadError(errMsg(err, "Could not load GRNs.")); });
    return () => { active = false; };
  }, [allowed, refreshToken]);

  function openQuality(grn: GrnRow) {
    if (!editable() || !canCheck(grn)) return;
    generation.current++;
    setSelected(grn); setResult("PASS"); setFailures({}); setNote(""); setPhotoUrl(""); setError("");
  }
  function closeQuality() {
    if (!editable()) return;
    generation.current++; setSelected(null); setError("");
  }
  // A response is evidence only when it identifies this exact durable decision,
  // including every original line. Never infer posting from a non-PENDING status.
  function matchesSaved(row: GrnRow, attempt: NonNullable<typeof intent.current>) {
    const original = attempt.grn, body = attempt.body;
    if (!row || row.id !== original.id || row.branchId !== original.branchId || row.isGeneralPurchase !== original.isGeneralPurchase || row.qualityRecorded !== true || row.reconciliationRequired || !row.qualityRecordedAt || row.qualityResult !== body.result || row.status !== (body.result === "FAIL" ? "QUALITY_HOLD" : "APPROVED") || (row.qualityNote ?? "").trim() !== body.note || (row.qualityPhotoUrl ?? "").trim() !== body.photoUrl || !Array.isArray(row.lines) || row.lines.length !== original.lines.length || new Set(row.lines.map(line => line.id)).size !== original.lines.length) return false;
    return row.inventoryPosted === (!original.isGeneralPurchase && body.result !== "FAIL") && row.lines.every(line => {
      const source = original.lines.find(value => value.id === line.id), decision = body.lines.find(value => value.id === line.id);
      if (!source || !decision || line.rawMaterialId !== source.rawMaterialId || line.unit !== source.unit) return false;
      const received = quantity(line.qtyReceived), failed = quantity(line.qtyFailed), accepted = quantity(line.qtyAccepted);
      return received !== null && received === quantity(source.qtyReceived) && failed !== null && failed === quantity(decision.qtyFailed) && accepted !== null && accepted === received - failed;
    });
  }
  function acceptSaved(row: GrnRow) {
    readVersion.current++;
    setGrns(prev => prev.map(value => value.id === row.id ? row : value));
    intent.current = null; setUncertain(false); setSelected(null); setError("");
  }
  async function saveQuality(replay = false) {
    if (busyRef.current || !selected || !canCheck(selected)) return;
    if (replay ? !intent.current : !!intent.current) return;
    if (!replay && !formValid) { setError("Enter valid line quantities and a failure note (3–1000 characters) for FAIL/PARTIAL."); return; }
    const body: Decision = { result, lines: decisionLines, note: note.trim(), photoUrl: photoUrl.trim() };
    const attempt = replay ? intent.current! : { grn: selected, body, serialized: JSON.stringify(body) };
    const token = generation.current;
    intent.current = attempt; busyRef.current = true; setBusy(true); setError(""); readVersion.current++;
    try {
      const data = await requestJson<{ grn: GrnRow; replayed: boolean }>(`/api/purchase/grns/${attempt.grn.id}/quality`, { method: "POST", body: attempt.serialized });
      if (!current() || token !== generation.current) return;
      if (!matchesSaved(data.grn, attempt)) throw new Error("The response did not confirm the original quality decision.");
      acceptSaved(data.grn);
    } catch (err) {
      if (!current() || token !== generation.current) return;
      if (!replay && err instanceof RequestJsonError && err.outcome === "rejected") { intent.current = null; setUncertain(false); setError(err.message); }
      else { setUncertain(true); setError("Outcome unconfirmed. Keep the original decision: check saved quality or explicitly replay the exact request. " + errMsg(err, "Unknown response.")); }
    } finally {
      if (current() && token === generation.current) { busyRef.current = false; setBusy(false); }
    }
  }
  async function checkSaved() {
    const attempt = intent.current;
    if (!attempt || busyRef.current || !canCheck(attempt.grn)) return;
    const token = generation.current;
    busyRef.current = true; setBusy(true); readVersion.current++;
    try {
      const data = await requestJson<{ grn: GrnRow }>(`/api/purchase/grns/${encodeURIComponent(attempt.grn.id)}?${new URLSearchParams({ branchId: attempt.grn.branchId })}`);
      if (!current() || token !== generation.current) return;
      const row = data?.grn;
      if (row && matchesSaved(row, attempt)) acceptSaved(row);
      else setError("Original decision is still unconfirmed or needs reconciliation. Editing remains locked; check again or replay the exact request.");
    } catch (err) { if (current() && token === generation.current) setError(errMsg(err, "Could not check saved quality. Original decision remains locked.")); }
    finally { if (current() && token === generation.current) { busyRef.current = false; setBusy(false); } }
  }
  return <>
    {loadError && <p role="alert" className="text-sm text-destructive">{uiText(loadError)}</p>}
    <Card><CardContent className="pt-5"><Table><TableHeader><TableRow>
      <TableHead>{uiText("GRN")}</TableHead><TableHead>{uiText("PO Number")}</TableHead><TableHead>{uiText("Branch")}</TableHead>
      <TableHead>{uiText("Received By")}</TableHead><TableHead>{uiText("Quality Result")}</TableHead><TableHead>{uiText("All received lines")}</TableHead><TableHead>{uiText("Inventory")}</TableHead><TableHead />
    </TableRow></TableHeader><TableBody>{grns.map(g => <TableRow key={g.id}>
      <TableCell>{g.id.slice(0, 8)}</TableCell><TableCell>{g.poNumber}</TableCell><TableCell>{g.branch}</TableCell><TableCell>{g.receivedBy}</TableCell>
      <TableCell><Badge variant={g.qualityResult === "PASS" ? "success" : g.qualityResult === "FAIL" ? "destructive" : g.qualityResult === "PARTIAL" ? "warning" : "secondary"}>{g.qualityResult}</Badge>
        <p className="text-xs">{g.status}</p>{g.qualityNote && <p className="max-w-64 break-words text-xs">{g.qualityNote}</p>}{g.qualityPhotoUrl && <p className="max-w-64 break-words text-xs">{uiText("Reference")}: {g.qualityPhotoUrl}</p>}
        {g.qualityRecorded && <p className="text-xs">{g.qualityRecordedAt}</p>}
      </TableCell><TableCell>{g.lines.map(line => <div key={line.id} className="min-w-0 break-words text-sm">
        {line.name || line.itemDescription} — {uiText("Received")}: {line.qtyReceived} {line.unit}; {uiText("Failed")}: {line.qtyFailed} {line.unit}; {uiText("Accepted")}: {line.qtyAccepted} {line.unit}
      </div>)}</TableCell><TableCell>{g.qualityRecorded && g.inventoryPosted ? <Badge variant="success">{uiText("Posted ✓")}</Badge> : uiText("Not posted")}</TableCell>
      <TableCell>{g.reconciliationRequired ? <p className="text-xs text-destructive">{uiText("Reconciliation required — prior inventory posting cannot be verified. Do not repost.")}</p> : g.qualityReady && !g.qualityRecorded && g.qualityResult === "PENDING" && <>
        <Button disabled={busy || uncertain || !canCheck(g)} onClick={() => openQuality(g)}>{uiText("Quality Check")}</Button>
        {!g.isGeneralPurchase && !inventoryAllowed && <p className="text-xs text-muted-foreground">{uiText("Store quality requires PURCHASE_ORDER and INVENTORY access. Ask an administrator; no grants are changed here.")}</p>}
      </>}</TableCell>
    </TableRow>)}</TableBody></Table></CardContent></Card>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) closeQuality(); }}><DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{uiText("Quality Check")} — {selected?.id.slice(0, 8)}</DialogTitle><DialogDescription>{selected?.isGeneralPurchase ? uiText("General purchase: quality is saved, but no inventory is posted.") : uiText("Accepted material quantities post atomically with the saved quality decision. Store quality checks require PURCHASE_ORDER and INVENTORY access.")}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{uiText(error)}</p>}
      <p className="text-xs text-muted-foreground">{uiText("Failed quantities queue expected refund/credit claims for Accounts. This is not money received, physical dispatch or vendor acceptance. No cash or journal is posted.", "Failed quantities ke expected refund/credit claims Accounts ke liye queue hote hain. Yeh paisa receive hone, physical dispatch ya vendor acceptance ka proof nahi. Cash ya journal post nahi hota.")}</p>
      <fieldset disabled={busy || uncertain} className="min-w-0 space-y-3">
        <div className="flex gap-2">{(["PASS", "PARTIAL", "FAIL"] as const).map(value => <button key={value} type="button" aria-pressed={result === value} className={`flex-1 rounded border p-2 text-sm ${result === value ? "bg-primary text-primary-foreground" : "bg-card"}`} onClick={() => { if (editable()) setResult(value); }}>{value}</button>)}</div>
        {selected?.lines.map(line => <div key={line.id} className="min-w-0 space-y-2 rounded border p-3">
          <p className="break-words">{line.name || line.itemDescription} — {line.qtyReceived} {line.unit}</p>
          {result === "PARTIAL" ? <label className="block text-xs">{uiText("Failed quantity")} ({line.unit})<input type="number" min="0" max={line.qtyReceived} step="0.001" aria-label={`Failed quantity for ${line.id}`} value={failures[line.id] ?? "0"} onChange={e => { if (editable()) setFailures(prev => ({ ...prev, [line.id]: e.target.value })); }} className="w-full min-w-0 rounded border p-2" /></label> : <p className="text-xs">{uiText("Failed quantity")}: {result === "PASS" ? "0" : line.qtyReceived} {line.unit}</p>}
        </div>)}
        <Field label={uiText("Quality note (required for FAIL/PARTIAL)")}><textarea aria-label="Quality note" maxLength={1000} value={note} onChange={e => { if (editable()) setNote(e.target.value); }} className="w-full min-w-0 rounded border p-2" /></Field>
        <Field label={uiText("Photo/reference (not an upload)")}><input aria-label="Photo/reference (not an upload)" maxLength={2000} value={photoUrl} onChange={e => { if (editable()) setPhotoUrl(e.target.value); }} className="w-full min-w-0 rounded border p-2" /></Field>
      </fieldset>
      <DialogFooter>
        <Button variant="outline" onClick={closeQuality} disabled={busy || uncertain}>{uiText("Cancel quality")}</Button>
        {uncertain && <><Button variant="outline" onClick={checkSaved} disabled={busy}>{uiText("Check saved quality")}</Button><Button variant="outline" onClick={() => saveQuality(true)} disabled={busy}>{uiText("Replay exact request")}</Button></>}
        <Button onClick={() => saveQuality()} disabled={busy || uncertain || !formValid || !selected || !canCheck(selected)}>{uiText("Save quality")}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  </>;
}
