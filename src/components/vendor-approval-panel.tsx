"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches } from "@/lib/current-branch";
import { useUiCopy } from "@/lib/ui-copy";

const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }

interface VendorRow { id: string; name: string; phoneE164: string; tin: string; status: "DRAFT" | "APPROVED" | "SUSPENDED"; approvedBranchId: string | null; approvedCategory: string | null; }

// GAP-015 — approved vendor onboarding and enforcement. This panel is
// purely a review UI: the REAL enforcement happens server-side inside the
// Purchase Order creation transaction (src/lib/server/vendor-approval.ts,
// assertVendorEligible) — this panel can never be bypassed by a client
// that skips it, since the gate lives in the mutation itself.
export function VendorApprovalPanel() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const { branches } = useBranches();
  const owner = actor.role === "SUPER_ADMIN";
  const [vendors, setVendors] = React.useState<VendorRow[]>([]);
  const [scopeDrafts, setScopeDrafts] = React.useState<Record<string, { branchId: string; category: string; reason: string }>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function load() {
    const res = await requestJson<{ vendors: VendorRow[] }>("/api/purchase/vendors");
    setVendors(res.vendors);
  }
  React.useEffect(() => { void load().catch(() => {}); }, []);

  const draftFor = (id: string) => scopeDrafts[id] ?? { branchId: "", category: "", reason: "" };
  const setDraft = (id: string, patch: Partial<{ branchId: string; category: string; reason: string }>) =>
    setScopeDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }));

  async function approve(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const draft = draftFor(id);
      await requestJson(`/api/purchase/vendors/${id}/approve`, { method: "POST", body: JSON.stringify({ branchId: draft.branchId || null, category: draft.category || null, reason: draft.reason }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not approve."); }
    finally { setBusy(false); }
  }

  async function suspend(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const draft = draftFor(id);
      await requestJson(`/api/purchase/vendors/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason: draft.reason }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not suspend."); }
    finally { setBusy(false); }
  }

  const branchName = (id: string | null) => id ? branches.find((b) => b.id === id)?.name ?? id : uiText("All branches", "Sab branches");
  const badgeVariant = (status: VendorRow["status"]) => status === "APPROVED" ? "default" : status === "SUSPENDED" ? "destructive" : "secondary";

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div><h3 className="font-semibold">{uiText("Vendor approval (GAP-015)", "Vendor approval (GAP-015)")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{uiText("A DRAFT or SUSPENDED vendor cannot be used on a new Purchase Order — the server enforces this, not just this screen. Existing vendors were approved (unrestricted) in a one-time cutover so purchasing never silently stopped; only vendors created from now on start as DRAFT.", "DRAFT ya SUSPENDED vendor se nayi Purchase Order nahi ban sakti \u2014 yeh server enforce karta hai, sirf yeh screen nahi. Existing vendors ek-baar-ki cutover se approved ho gaye the taaki purchasing na ruke; sirf ab se bane vendors DRAFT se shuru hote hain.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

    <div className="space-y-2">
      {vendors.map((v) => <div key={v.id} className="rounded border p-3 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{v.name} — {v.phoneE164}</span>
          <Badge variant={badgeVariant(v.status)}>{v.status}</Badge>
        </div>
        <p className="text-muted-foreground">{uiText("Scope", "Scope")}: {branchName(v.approvedBranchId)}{v.approvedCategory ? `, ${v.approvedCategory}` : `, ${uiText("all categories", "sab categories")}`}</p>
        {owner && <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[140px]"><Field label={uiText("Restrict to branch (optional)", "Branch tak seemit (optional)")}><select className={inputClass} value={draftFor(v.id).branchId} onChange={(e) => setDraft(v.id, { branchId: e.target.value })}><option value="">{uiText("All branches", "Sab branches")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field></div>
          <div className="min-w-[120px]"><Field label={uiText("Restrict to category (optional)", "Category tak seemit (optional)")}><input className={inputClass} value={draftFor(v.id).category} onChange={(e) => setDraft(v.id, { category: e.target.value })} placeholder={uiText("e.g. Vegetables", "jaise Vegetables")} /></Field></div>
          <div className="min-w-[140px]"><Field label={uiText("Reason (optional)", "Reason (optional)")}><input className={inputClass} value={draftFor(v.id).reason} onChange={(e) => setDraft(v.id, { reason: e.target.value })} /></Field></div>
          <Button type="button" disabled={busy} onClick={() => approve(v.id)}>{uiText("Approve", "Approve karein")}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => suspend(v.id)}>{uiText("Suspend", "Suspend karein")}</Button>
        </div>}
      </div>)}
      {!vendors.length && <p className="text-xs text-muted-foreground">{uiText("No vendors yet.", "Abhi koi vendor nahi hai.")}</p>}
    </div>
  </section>;
}
