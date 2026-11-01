"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requestJson, useCurrentUser } from "@/lib/current-user";
import { useSelectedBranchId } from "@/lib/current-branch";
import { useUiCopy } from "@/lib/ui-copy";

const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }

interface VendorOption { id: string; name: string; }
interface LineDraft { itemDescription: string; qty: string; rate: string; }
interface RequestRow {
  id: string; branchId: string; branch: string; requestedById: string; requestedBy: string;
  vendorId: string; vendor: string; linesJson: LineDraft[]; valueTsh: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CONSUMED"; approvedById: string | null; approvedAt: string | null; createdAt: string;
}
const blankLine = (): LineDraft => ({ itemDescription: "", qty: "", rate: "" });

// GAP-016 — mandatory HO approval for general purchases at/above the
// Owner's configured value threshold (/admin/settings/business-policy).
// This panel ONLY submits/reviews the request; the real Purchase Order is
// still created on the "Purchase Orders" tab, passing this request's id
// once it shows APPROVED here.
export function GeneralPurchaseApprovalsPanel() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const branchId = actor.role === "SUPER_ADMIN" ? selected : actor.branchId ?? "";
  const owner = actor.role === "SUPER_ADMIN";
  const [vendors, setVendors] = React.useState<VendorOption[]>([]);
  const [requests, setRequests] = React.useState<RequestRow[]>([]);
  const [draft, setDraft] = React.useState<{ vendorId: string; lines: LineDraft[] }>({ vendorId: "", lines: [blankLine()] });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  async function load() {
    if (!branchId || branchId === "all") { setRequests([]); return; }
    const [v, r] = await Promise.all([
      requestJson<{ vendors: VendorOption[] }>("/api/purchase/vendors"),
      requestJson<{ generalPurchaseRequests: RequestRow[] }>(`/api/purchase/general-purchase-requests?branchId=${encodeURIComponent(branchId)}`),
    ]);
    setVendors(v.vendors);
    setRequests(r.generalPurchaseRequests);
  }
  React.useEffect(() => { void load().catch(() => {}); }, [branchId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !branchId || branchId === "all") return;
    setBusy(true); setError(""); setMessage("");
    try {
      const lines = draft.lines.filter((l) => l.itemDescription && l.qty && l.rate);
      if (!lines.length) throw new Error(uiText("Add at least one line.", "Kam az kam ek line add karein."));
      const res = await requestJson<{ request: RequestRow; gated: boolean }>("/api/purchase/general-purchase-requests", { method: "POST", body: JSON.stringify({ branchId, vendorId: draft.vendorId, lines }) });
      setMessage(res.gated
        ? uiText(`Value TSh ${res.request.valueTsh} is at/above the Owner's threshold — pending Owner review before a Purchase Order can be created.`, `TSh ${res.request.valueTsh} threshold se upar hai \u2014 Owner review ke baad hi PO banegi.`)
        : uiText(`Value TSh ${res.request.valueTsh} is below the threshold — approved immediately, use request id ${res.request.id} (or none) on the Purchase Orders tab.`, `TSh ${res.request.valueTsh} threshold se neeche hai \u2014 turant approved.`));
      setDraft({ vendorId: "", lines: [blankLine()] });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not submit."); }
    finally { setBusy(false); }
  }

  async function decide(id: string, action: "approve" | "reject") {
    if (busy) return;
    setBusy(true); setError("");
    try { await requestJson(`/api/purchase/general-purchase-requests/${id}/${action}`, { method: "POST" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not decide."); }
    finally { setBusy(false); }
  }

  const badgeVariant = (status: RequestRow["status"]) => status === "APPROVED" ? "default" : status === "REJECTED" ? "destructive" : status === "CONSUMED" ? "secondary" : "outline";

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div><h3 className="font-semibold">{uiText("General Purchase HO approvals (GAP-016)", "General Purchase HO approvals (GAP-016)")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{uiText("A general purchase at/above the Owner's configured value threshold cannot skip review by flagging itself general-purchase — it needs an APPROVED request here first, then the matching Purchase Order can be created on the Purchase Orders tab referencing this request's id.", "General Purchase bhi threshold se upar ho to review zaroori hai \u2014 pehle yahan APPROVED record banega, phir Purchase Orders tab par PO banegi.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    {(!branchId || branchId === "all") && <p className="text-xs text-muted-foreground">{uiText("Select a single branch to submit or review requests.", "Ek branch chunein.")}</p>}

    {branchId && branchId !== "all" && <form onSubmit={submit}><fieldset disabled={busy} className="space-y-2">
      <div className="min-w-[160px]"><Field label={uiText("Vendor", "Vendor")}><select required className={inputClass} value={draft.vendorId} onChange={(e) => setDraft((prev) => ({ ...prev, vendorId: e.target.value }))}><option value="">{uiText("Select", "Chunein")}</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field></div>
      {draft.lines.map((line, i) => <div key={i} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px]"><Field label={uiText("Item", "Item")}><input required className={inputClass} value={line.itemDescription} onChange={(e) => setDraft((prev) => ({ ...prev, lines: prev.lines.map((l, n) => n === i ? { ...l, itemDescription: e.target.value } : l) }))} /></Field></div>
        <div className="w-24"><Field label={uiText("Qty", "Qty")}><input required type="number" min="0.001" step="0.001" className={inputClass} value={line.qty} onChange={(e) => setDraft((prev) => ({ ...prev, lines: prev.lines.map((l, n) => n === i ? { ...l, qty: e.target.value } : l) }))} /></Field></div>
        <div className="w-28"><Field label={uiText("Rate (TSh)", "Rate (TSh)")}><input required type="number" min="0.01" step="0.01" className={inputClass} value={line.rate} onChange={(e) => setDraft((prev) => ({ ...prev, lines: prev.lines.map((l, n) => n === i ? { ...l, rate: e.target.value } : l) }))} /></Field></div>
        <Button type="button" variant="outline" disabled={draft.lines.length === 1} onClick={() => setDraft((prev) => ({ ...prev, lines: prev.lines.filter((_, n) => n !== i) }))}>{uiText("Remove", "Remove")}</Button>
      </div>)}
      <Button type="button" variant="outline" onClick={() => setDraft((prev) => ({ ...prev, lines: [...prev.lines, blankLine()] }))}>{uiText("Add line", "Line add karein")}</Button>
      <Button type="submit" disabled={busy}>{uiText("Submit for review", "Review ke liye submit karein")}</Button>
    </fieldset></form>}

    <div className="space-y-2">
      {requests.map((r) => <div key={r.id} className="rounded border p-3 text-xs space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{r.vendor} — TSh {r.valueTsh} — {r.requestedBy}</span>
          <Badge variant={badgeVariant(r.status)}>{r.status.replace(/_/g, " ")}</Badge>
        </div>
        <p className="text-muted-foreground">id: {r.id}</p>
        {r.status === "PENDING_APPROVAL" && owner && <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => decide(r.id, "approve")}>{uiText("Approve", "Approve karein")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => decide(r.id, "reject")}>{uiText("Reject", "Reject karein")}</Button>
        </div>}
        {r.status === "PENDING_APPROVAL" && !owner && <p className="text-muted-foreground">{uiText("Awaiting Owner review.", "Owner review ka wait hai.")}</p>}
      </div>)}
      {!requests.length && branchId && branchId !== "all" && <p className="text-xs text-muted-foreground">{uiText("No requests yet.", "Abhi koi request nahi hai.")}</p>}
    </div>
  </section>;
}
