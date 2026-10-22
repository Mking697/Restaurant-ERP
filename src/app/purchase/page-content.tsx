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
import {
  getIndents,
  getPurchaseOrders,
  getGrns,
  type IndentRow,
  type PurchaseOrderRow,
  type GrnRow,
} from "@/lib/mock-data";
import { formatInr } from "@/lib/utils";
import { Plus, Check, X, Upload, PackageCheck, FlaskConical } from "lucide-react";

const INDENT_VARIANT: Record<string, "secondary" | "warning" | "success" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  PO_RAISED: "outline",
};

export default function PurchasePage() {
  const uiText = useUiCopy();
  const [indents, setIndents] = React.useState<IndentRow[]>(getIndents());
  const [pos, setPos] = React.useState<PurchaseOrderRow[]>(getPurchaseOrders());
  const [grns, setGrns] = React.useState<GrnRow[]>(getGrns());
  const [raiseOpen, setRaiseOpen] = React.useState(false);
  const [poOpen, setPoOpen] = React.useState(false);
  const [qualityGrn, setQualityGrn] = React.useState<GrnRow | null>(null);
  const [qualityResult, setQualityResult] = React.useState<"PASS" | "FAIL" | "PARTIAL">("PASS");
  const [failQty, setFailQty] = React.useState("");
  const { notify, ToastHost } = useToast();

  const [indentForm, setIndentForm] = React.useState({ branch: "", raisedBy: "", lineCount: "1" });
  const [poForm, setPoForm] = React.useState({
    isGeneral: false,
    branch: "",
    vendor: "",
    itemOrMaterial: "",
    amountInr: "",
  });

  function raiseIndent() {
    if (!indentForm.branch.trim() || !indentForm.raisedBy.trim()) return;
    const id = `IND-${1043 + indents.length}`;
    setIndents((prev) => [
      {
        id,
        branch: indentForm.branch.trim(),
        raisedBy: indentForm.raisedBy.trim(),
        status: "DRAFT",
        spikePercent: null,
        lineCount: Number(indentForm.lineCount) || 1,
        createdAt: "Just now",
      },
      ...prev,
    ]);
    notify(uiText(`Demo indent ${id} raised for ${indentForm.branch}. Submit for approval next. Not saved.`, `${indentForm.branch} ke liye demo indent ${id} bani. Ab approval ke liye bhejo. Save nahi hui.`));
    setIndentForm({ branch: "", raisedBy: "", lineCount: "1" });
    setRaiseOpen(false);
  }

  function approveIndent(id: string) {
    setIndents((prev) => prev.map((i) => (i.id === id ? { ...i, status: "APPROVED" } : i)));
    notify(uiText(`Demo indent ${id} approved. No live purchase was created.`, `Demo indent ${id} approve hui. Live purchase create nahi hui.`));
  }
  function rejectIndent(id: string) {
    setIndents((prev) => prev.map((i) => (i.id === id ? { ...i, status: "REJECTED" } : i)));
    notify(uiText(`Demo indent ${id} rejected.`, `Demo indent ${id} reject hui.`));
  }
  function submitIndentForApproval(id: string) {
    setIndents((prev) => prev.map((i) => (i.id === id ? { ...i, status: "PENDING_APPROVAL" } : i)));
    notify(uiText(`Demo indent ${id} submitted for approval. No notification was sent.`, `Demo indent ${id} approval ke liye submit hui. Notification nahi bheja gaya.`));
  }

  function addPurchase() {
    if (!poForm.branch.trim() || !poForm.vendor.trim() || !poForm.itemOrMaterial.trim() || !poForm.amountInr.trim()) return;
    const poNumber = `PO-${5522 + pos.length}`;
    setPos((prev) => [
      {
        poNumber,
        branch: poForm.branch.trim(),
        vendor: poForm.vendor.trim(),
        isGeneralPurchase: poForm.isGeneral,
        amountInr: Number(poForm.amountInr) || 0,
        bought: true, // Step 1 happens at creation
        billUploaded: false,
        materialReceived: false,
        createdAt: "Just now",
      },
      ...prev,
    ]);
    notify(uiText(`Demo ${poNumber} created (Step 1: Buy). Not saved to database.`, `Demo ${poNumber} bana (Step 1: Buy). Database mein save nahi hua.`));
    setPoForm({ isGeneral: false, branch: "", vendor: "", itemOrMaterial: "", amountInr: "" });
    setPoOpen(false);
  }

  function markBillUploaded(poNumber: string) {
    setPos((prev) => prev.map((p) => (p.poNumber === poNumber ? { ...p, billUploaded: true } : p)));
    notify(uiText(`Demo ${poNumber} — bill step marked complete. No file was uploaded.`, `Demo ${poNumber} — bill step complete mark hua. File upload nahi hui.`));
  }

  function markMaterialReceived(po: PurchaseOrderRow) {
    setPos((prev) => prev.map((p) => (p.poNumber === po.poNumber ? { ...p, materialReceived: true } : p)));
    const grnId = `GRN-${3311 + grns.length}`;
    setGrns((prev) => [
      {
        id: grnId,
        poNumber: po.poNumber,
        branch: po.branch,
        status: "PENDING",
        qualityResult: "PENDING",
        qtyFailed: 0,
        uom: "kg",
        receivedBy: "You",
        createdAt: "Just now",
      },
      ...prev,
    ]);
    notify(uiText(`Demo ${po.poNumber}: material received and ${grnId} created in page state. Try Quality Check.`, `Demo ${po.poNumber}: material receive hua aur page state mein ${grnId} bana. Quality Check try karo.`));
  }

  function openQualityCheck(grn: GrnRow) {
    setQualityGrn(grn);
    setQualityResult("PASS");
    setFailQty("");
  }

  function submitQualityCheck() {
    if (!qualityGrn) return;
    const qty = qualityResult === "PASS" ? 0 : Number(failQty) || 0;
    if (qualityResult !== "PASS" && qty <= 0) return;
    setGrns((prev) =>
      prev.map((g) =>
        g.id === qualityGrn.id
          ? { ...g, qualityResult, qtyFailed: qty, status: qualityResult === "FAIL" ? "QUALITY_HOLD" : "APPROVED" }
          : g
      )
    );
    if (qualityResult === "PASS") {
      notify(uiText(`Demo ${qualityGrn.id}: Quality PASS. Live inventory was not updated.`, `Demo ${qualityGrn.id}: Quality PASS. Live inventory update nahi hui.`));
    } else {
      const refund = qty * 450; // illustrative rate for the toast only
      notify(
        uiText(`Demo ${qualityGrn.id}: ${qualityResult}, failed ${qty} ${qualityGrn.uom}, illustrative refund ${formatInr(refund)}. No vendor return or Accounts refund was posted.`, `Demo ${qualityGrn.id}: ${qualityResult}, failed ${qty} ${qualityGrn.uom}, sample refund ${formatInr(refund)}. Vendor return ya Accounts refund post nahi hua.`)
      );
    }
    setQualityGrn(null);
  }

  return (
    <AppShell activeHref="/purchase">
      <PageHeader
        title={uiText("Purchase & GRN")}
        description={uiText("Indent (hand) → Manager Approval → Purchase (Buy → Bill Upload (optional) → Material Receive) → Quality Check → Inventory.")}
      >
        <Dialog open={poOpen} onOpenChange={setPoOpen}>
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
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={poForm.isGeneral}
                  onChange={(e) => setPoForm({ ...poForm, isGeneral: e.target.checked })}
                />
                {uiText(" General purchase (store/raw-material se related nahi — no Indent needed) ")}</label>
              <Field label={uiText("Branch")}>
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={poForm.branch}
                  onChange={(e) => setPoForm({ ...poForm, branch: e.target.value })}
                  placeholder={uiText("Gurugram")}
                />
              </Field>
              <Field label={uiText("Vendor")}>
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={poForm.vendor}
                  onChange={(e) => setPoForm({ ...poForm, vendor: e.target.value })}
                  placeholder={uiText("Fresh Farms Supply Co.")}
                />
              </Field>
              <Field label={poForm.isGeneral ? uiText("Item description") : uiText("Raw material / Indent reference")}>
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={poForm.itemOrMaterial}
                  onChange={(e) => setPoForm({ ...poForm, itemOrMaterial: e.target.value })}
                  placeholder={poForm.isGeneral ? uiText("Office chair repair") : uiText("Chicken (boneless) — 20kg")}
                />
              </Field>
              <Field label={uiText("Amount (₹)")}>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={poForm.amountInr}
                  onChange={(e) => setPoForm({ ...poForm, amountInr: e.target.value })}
                  placeholder={uiText("9400")}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPoOpen(false)}>
                {uiText(" Cancel ")}</Button>
              <Button
                onClick={addPurchase}
                disabled={!poForm.branch.trim() || !poForm.vendor.trim() || !poForm.itemOrMaterial.trim() || !poForm.amountInr.trim()}
              >
                {uiText(" Create (Step 1: Buy) ")}</Button>
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
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={indentForm.branch}
                  onChange={(e) => setIndentForm({ ...indentForm, branch: e.target.value })}
                  placeholder={uiText("Gurugram")}
                />
              </Field>
              <Field label={uiText("Raised by")}>
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={indentForm.raisedBy}
                  onChange={(e) => setIndentForm({ ...indentForm, raisedBy: e.target.value })}
                  placeholder={uiText("Rahul Sharma")}
                />
              </Field>
              <Field label={uiText("Number of line items")}>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={indentForm.lineCount}
                  onChange={(e) => setIndentForm({ ...indentForm, lineCount: e.target.value })}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRaiseOpen(false)}>
                {uiText(" Cancel ")}</Button>
              <Button onClick={raiseIndent} disabled={!indentForm.branch.trim() || !indentForm.raisedBy.trim()}>
                {uiText(" Raise ")}</Button>
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
                      <TableCell className="font-medium">{i.id}</TableCell>
                      <TableCell>{i.branch}</TableCell>
                      <TableCell>{i.raisedBy}</TableCell>
                      <TableCell>{i.lineCount}</TableCell>
                      <TableCell>
                        {i.spikePercent != null ? (
                          <Badge variant={i.spikePercent > 25 ? "destructive" : "outline"}>+{i.spikePercent.toFixed(1)}%</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={INDENT_VARIANT[i.status]}>{i.status.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="space-x-1">
                        {i.status === "DRAFT" && (
                          <Button size="sm" variant="outline" onClick={() => submitIndentForApproval(i.id)}>
                            {uiText(" Submit for Approval ")}</Button>
                        )}
                        {i.status === "PENDING_APPROVAL" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => approveIndent(i.id)}>
                              <Check className="size-3.5 text-success" /> {uiText(" Approve ")}</Button>
                            <Button size="sm" variant="outline" onClick={() => rejectIndent(i.id)}>
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
                  {pos.map((p) => (
                    <TableRow key={p.poNumber}>
                      <TableCell className="font-medium">{p.poNumber}</TableCell>
                      <TableCell>{p.branch}</TableCell>
                      <TableCell>{p.vendor}</TableCell>
                      <TableCell>
                        <Badge variant={p.isGeneralPurchase ? "outline" : "secondary"}>
                          {p.isGeneralPurchase ? uiText("General") : uiText("Store")}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatInr(p.amountInr)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="success">{uiText("1. Bought")}</Badge>
                          {p.billUploaded ? (
                            <Badge variant="success">{uiText("2. Bill ✓")}</Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => markBillUploaded(p.poNumber)}>
                              <Upload className="size-3.5" /> {uiText(" Upload Bill (optional) ")}</Button>
                          )}
                          {p.materialReceived ? (
                            <Badge variant="success">{uiText("3. Received ✓")}</Badge>
                          ) : (
                            <Button size="sm" onClick={() => markMaterialReceived(p)}>
                              <PackageCheck className="size-3.5" /> {uiText(" Mark Material Received ")}</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grns.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.id}</TableCell>
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

      {/* Quality check dialog — Pass posts to inventory; Fail/Partial records a return + accounts refund entry */}
      <Dialog open={!!qualityGrn} onOpenChange={(open) => !open && setQualityGrn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText("Quality Check — ")}{qualityGrn?.id}</DialogTitle>
            <DialogDescription>
              {uiText(" Pass → material Inventory Stock mein chala jaata hai. Fail/Partial → fail qty return hoti hai aur uska amount Accounts mein refund entry ban jaata hai. ")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQualityGrn(null)}>
              {uiText(" Cancel ")}</Button>
            <Button onClick={submitQualityCheck} disabled={qualityResult !== "PASS" && !failQty.trim()}>
              {uiText(" Submit ")}</Button>
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
