"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requestJson, useCurrentUser } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";
import { Field } from "./recipe-builder";
import type { MenuItemRow } from "./menu-ui-helpers";

interface Standard { id: string; menuItemId: string; minYieldPercent: string; maxYieldPercent: string; }
interface Deviation { id: string; menuItemName: string; yieldPercent: string; minYieldPercentAtEvaluation: string; maxYieldPercentAtEvaluation: string; reviewedAt: string | null; reviewReason: string | null; outputQty: string; outputUnitAtSubmission: string; }

// GAP-011 — Owner-only yield standards + review queue for Actual Cutting
// (GAP-009/010 scope only). SOFT flag only: a deviation never blocks a
// production (see src/lib/server/yield-standards.ts for the full design
// note) — this panel is purely about setting the approved band and
// reviewing what already happened, never about approving/rejecting a
// production itself.
export function YieldStandardsPanel({ branchId, items }: { branchId: string; items: MenuItemRow[] }) {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const owner = actor.role === "SUPER_ADMIN";
  const [menuItemId, setMenuItemId] = React.useState("");
  const [current, setCurrent] = React.useState<Standard | null>(null);
  const [minYield, setMinYield] = React.useState("");
  const [maxYield, setMaxYield] = React.useState("");
  const [deviations, setDeviations] = React.useState<Deviation[]>([]);
  const [reviewReasons, setReviewReasons] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  async function loadDeviations() {
    const result = await requestJson<{ deviations: Deviation[] }>(`/api/menu-items/yield-deviations?branchId=${encodeURIComponent(branchId)}&unreviewedOnly=true`);
    setDeviations(result.deviations);
  }
  React.useEffect(() => { void loadDeviations().catch(() => {}); }, [branchId]);
  React.useEffect(() => {
    if (!menuItemId) { setCurrent(null); return; }
    requestJson<{ standard: Standard | null }>(`/api/menu-items/${menuItemId}/yield-standard`).then((r) => setCurrent(r.standard)).catch(() => setCurrent(null));
  }, [menuItemId]);

  async function setStandard(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await requestJson<{ standard: Standard }>(`/api/menu-items/${menuItemId}/yield-standard`, { method: "POST", body: JSON.stringify({ minYieldPercent: minYield, maxYieldPercent: maxYield }) });
      setCurrent(result.standard);
      setMessage(uiText(`Standard set: ${result.standard.minYieldPercent}% - ${result.standard.maxYieldPercent}% yield.`, `Standard set ho gaya: ${result.standard.minYieldPercent}% - ${result.standard.maxYieldPercent}% yield.`));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not set standard."); }
    finally { setBusy(false); }
  }

  async function review(id: string) {
    const reason = (reviewReasons[id] ?? "").trim();
    if (!reason) { setError(uiText("A review reason is required.", "Review reason zaroori hai.")); return; }
    setBusy(true); setError("");
    try {
      await requestJson(`/api/menu-items/yield-deviations/${id}/review`, { method: "POST", body: JSON.stringify({ reason }) });
      await loadDeviations();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not review deviation."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div><h3 className="font-semibold">{uiText("Actual Cutting yield standards (Owner)", "Actual Cutting yield standards (Owner)")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{uiText("A SOFT check only — a production outside this band still posts; it is flagged here for review, never blocked.", "Sirf SOFT check \u2014 band se bahar production bhi post hota hai; yahan review ke liye flag hota hai, kabhi block nahi.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}

    {owner && <form onSubmit={setStandard}><fieldset disabled={busy} className="space-y-3">
      <Field label={uiText("Semi-FG item", "Semi-FG item")}><Select required value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}><option value="">{uiText("Select", "Chunein")}</option>{items.filter((item) => item.isSemiFg && item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      {menuItemId && <p className="text-xs text-muted-foreground">{current ? uiText(`Current: ${current.minYieldPercent}% - ${current.maxYieldPercent}%`, `Current: ${current.minYieldPercent}% - ${current.maxYieldPercent}%`) : uiText("No standard set yet for this item.", "Is item ke liye abhi koi standard set nahi hai.")}</p>}
      <Field label={uiText("Min yield %", "Min yield %")}><Input required type="number" min="0" max="100" step="0.01" value={minYield} onChange={(e) => setMinYield(e.target.value)} /></Field>
      <Field label={uiText("Max yield %", "Max yield %")}><Input required type="number" min="0" max="100" step="0.01" value={maxYield} onChange={(e) => setMaxYield(e.target.value)} /></Field>
      <Button type="submit" disabled={busy || !menuItemId}>{uiText("Set standard", "Standard set karein")}</Button>
    </fieldset></form>}

    <div className="space-y-2"><h4 className="text-sm font-medium">{uiText("Unreviewed yield deviations", "Unreviewed yield deviations")}</h4>
      {!deviations.length && <p className="text-xs text-muted-foreground">{uiText("No unreviewed deviations.", "Koi unreviewed deviation nahi hai.")}</p>}
      {deviations.map((row) => <div key={row.id} className="rounded border p-2 text-xs space-y-1">
        <p className="font-medium">{row.menuItemName} — {uiText("yield", "yield")} {row.yieldPercent}% ({uiText("approved", "approved")} {row.minYieldPercentAtEvaluation}%-{row.maxYieldPercentAtEvaluation}%)</p>
        {owner && <div className="flex gap-2"><Input aria-label={`Review reason for ${row.id}`} placeholder={uiText("Review reason", "Review reason")} value={reviewReasons[row.id] ?? ""} onChange={(e) => setReviewReasons((prev) => ({ ...prev, [row.id]: e.target.value }))} /><Button type="button" disabled={busy} onClick={() => review(row.id)}>{uiText("Mark reviewed", "Reviewed mark karein")}</Button></div>}
      </div>)}
    </div>
  </section>;
}
