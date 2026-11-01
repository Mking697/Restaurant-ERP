"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";
import { Field, inputClass } from "./recipe-builder";
import type { MenuItemRow } from "./menu-ui-helpers";

interface PreparedStatus { id: string; menuItemId: string; menuItemName: string; outputUnit: string; qtyOnHand: string; minStockLevel: string; maxStockLevel: string; breach: "LOW" | "HIGH" | "OK" | "UNCONFIGURED"; }

// GAP-012 — prepared-stock (Semi-FG) min/max par levels. SCOPED THIS PASS
// to threshold-based low/high alerting only (no expiry tracking — that is
// explicitly deferred, see src/lib/server/prepared-stock-thresholds.ts).
// MENU_BOM-authorized (same module gate as raw-material par levels), not
// Owner-exclusive. The threshold belongs to the item's shared stock
// balance — it cannot be split "only Actual Cutting's share" since the
// stock itself is fungible once produced, regardless of which mode made it.
export function PreparedStockThresholdsPanel({ branchId, items }: { branchId: string; items: MenuItemRow[] }) {
  const uiText = useUiCopy();
  const [status, setStatus] = React.useState<PreparedStatus[]>([]);
  const [menuItemId, setMenuItemId] = React.useState("");
  const [minLevel, setMinLevel] = React.useState("");
  const [maxLevel, setMaxLevel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  async function load() {
    const result = await requestJson<{ status: PreparedStatus[] }>(`/api/menu-items/prepared-stock-status?branchId=${encodeURIComponent(branchId)}`);
    setStatus(result.status);
  }
  React.useEffect(() => { void load().catch(() => {}); }, [branchId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await requestJson(`/api/menu-items/${menuItemId}/thresholds`, { method: "POST", body: JSON.stringify({ branchId, minStockLevel: minLevel, maxStockLevel: maxLevel }) });
      setMessage(uiText("Prepared-stock par levels saved.", "Prepared-stock par levels save ho gaye."));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save par levels."); }
    finally { setBusy(false); }
  }

  const breachLabel = (b: PreparedStatus["breach"]) => ({ LOW: uiText("LOW", "LOW"), HIGH: uiText("HIGH", "HIGH"), OK: uiText("OK", "OK"), UNCONFIGURED: uiText("Not configured", "Configure nahi hai") }[b]);

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div><h3 className="font-semibold">{uiText("Prepared-stock min/max par levels", "Prepared-stock min/max par levels")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{uiText("Threshold alerting only this pass — expiry/near-expiry tracking for prepared stock is a separate future gap.", "Sirf threshold alerting is pass mein \u2014 prepared stock ki expiry tracking alag future gap hai.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}

    <form onSubmit={submit}><fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[200px]"><Field label={uiText("Semi-FG item", "Semi-FG item")}><select required className={inputClass} value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}><option value="">{uiText("Select", "Chunein")}</option>{items.filter((item) => item.isSemiFg && item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
      <div className="w-32"><Field label={uiText("Min", "Min")}><input required type="number" min="0" step="0.001" className={inputClass} value={minLevel} onChange={(e) => setMinLevel(e.target.value)} /></Field></div>
      <div className="w-32"><Field label={uiText("Max", "Max")}><input required type="number" min="0" step="0.001" className={inputClass} value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)} /></Field></div>
      <Button type="submit" disabled={busy || !menuItemId}>{uiText("Save", "Save karein")}</Button>
    </fieldset></form>

    <div className="space-y-1">{status.map((row) => <div key={row.id} className="flex items-center justify-between rounded border p-2 text-xs">
      <span>{row.menuItemName} — {row.qtyOnHand} {row.outputUnit} ({uiText("min", "min")} {row.minStockLevel}, {uiText("max", "max")} {row.maxStockLevel})</span>
      <span className="font-medium">{breachLabel(row.breach)}</span>
    </div>)}
    {!status.length && <p className="text-xs text-muted-foreground">{uiText("No prepared-stock items yet.", "Abhi koi prepared-stock item nahi hai.")}</p>}</div>
  </section>;
}
