"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requestJson } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";
import { Field } from "./recipe-builder";
import type { MenuItemRow, RawMaterialRow } from "./menu-ui-helpers";

interface CuttingLine { id: string; menuItemId: string; inputs: { rawMaterialId: string; name: string; qtyKg: string }[]; outputQty: string; outputUnitAtSubmission: string; outputMassKg: string; wasteQtyKg: string; unaccountedLossPercent: string; tolerancePercentAtSubmission: string; inputTotalValueTsh: string; costPerOutputUnitTsh: string; producedAt?: string; }
interface InputDraft { rawMaterialId: string; qtyKg: string; }
const blankInput = (): InputDraft => ({ rawMaterialId: "", qtyKg: "" });

// GAP-009 "Actual Cutting" mode — a SEPARATE, always-available form from
// the Fixed-Recipe ProductionPanel (production-panel.tsx), chosen per
// production event by the operator (no per-item flag, Owner decision).
// Kept as its own component rather than merged into ProductionPanel's
// careful retry-intent/sessionStorage locking logic, to avoid risking that
// existing, already-working flow. Self-contained data fetch, same
// convention as ProductionPanel, rather than threaded parent state.
export function ActualCuttingPanel({ branchId, items, materials }: { branchId: string; items: MenuItemRow[]; materials: RawMaterialRow[] }) {
  const uiText = useUiCopy();
  const [records, setRecords] = React.useState<CuttingLine[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const alive = React.useRef(true);
  const url = `/api/semi-fg/production?branchId=${encodeURIComponent(branchId)}`;
  async function load() {
    const result = await requestJson<{ cuttingProductions: CuttingLine[] }>(url);
    if (alive.current) { setRecords(result.cuttingProductions); setLoaded(true); }
  }
  React.useEffect(() => {
    alive.current = true; setLoaded(false); setRecords([]);
    void load().catch(() => { if (alive.current) setLoaded(true); });
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const [menuItemId, setMenuItemId] = React.useState("");
  const [inputs, setInputs] = React.useState<InputDraft[]>([blankInput()]);
  const [outputQty, setOutputQty] = React.useState("");
  const [outputMassKg, setOutputMassKg] = React.useState("");
  const [wasteQtyKg, setWasteQtyKg] = React.useState("0");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const kgMaterials = materials.filter((material) => material.unit === "kg");
  const selectedItem = items.find((item) => item.id === menuItemId);
  const outputUnit = selectedItem?.outputUnit ?? "—";
  const needsMeasuredMass = outputUnit !== "kg";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = {
        branchId, menuItemId, inputs: inputs.map((line) => ({ rawMaterialId: line.rawMaterialId, qtyKg: line.qtyKg })),
        outputQty, wasteQtyKg, idempotencyKey: crypto.randomUUID(),
      };
      if (needsMeasuredMass) body.outputMassKg = outputMassKg;
      const result = await requestJson<{ production: CuttingLine; replayed: boolean }>("/api/semi-fg/cutting", { method: "POST", body: JSON.stringify(body) });
      setMessage(uiText(`Recorded. Batch value TSh ${result.production.inputTotalValueTsh}, cost/${result.production.outputUnitAtSubmission} TSh ${result.production.costPerOutputUnitTsh}. Unaccounted loss ${result.production.unaccountedLossPercent}% (tolerance ${result.production.tolerancePercentAtSubmission}%).`, `Record ho gaya. Batch value TSh ${result.production.inputTotalValueTsh}, cost/${result.production.outputUnitAtSubmission} TSh ${result.production.costPerOutputUnitTsh}. Unaccounted loss ${result.production.unaccountedLossPercent}% (tolerance ${result.production.tolerancePercentAtSubmission}%).`));
      setMenuItemId(""); setInputs([blankInput()]); setOutputQty(""); setOutputMassKg(""); setWasteQtyKg("0");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not record cutting. Check saved history before retrying."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div><h3 className="font-semibold">{uiText("Actual Cutting — measured input/output", "Actual Cutting — measured input/output")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{uiText("Record what was really consumed and really produced — never a fixed-recipe ratio. Output mass plus waste can never exceed input (hard rule); the remaining unaccounted loss must stay within the Owner's configured tolerance.", "Jo actually consume hua aur produce hua wahi record karein — fixed-recipe ratio nahi. Output mass plus waste input se zyada kabhi nahi ho sakta; baaki unaccounted loss Owner ki configured tolerance ke andar hona chahiye.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    <form onSubmit={submit}><fieldset disabled={busy} className="space-y-3">
      <Field label={uiText("Semi-FG output item", "Semi-FG output item")}><Select required value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}><option value="">{uiText("Select", "Chunein")}</option>{items.filter((item) => item.isSemiFg && item.isActive && item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.outputUnit})</option>)}</Select></Field>

      <p className="text-xs font-medium">{uiText("Real raw material input (kg only)", "Real raw material input (kg only)")}</p>
      {inputs.map((line, i) => <div key={i} className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><Field label={uiText("Raw material", "Raw material")}><Select required value={line.rawMaterialId} onChange={(e) => setInputs((prev) => prev.map((v, n) => n === i ? { ...v, rawMaterialId: e.target.value } : v))}><option value="">{uiText("Select", "Chunein")}</option>{kgMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</Select></Field></div>
        <div className="w-32"><Field label={uiText("Qty (kg)", "Qty (kg)")}><Input required type="number" min="0.001" step="0.001" aria-label={`Input quantity ${i + 1}`} value={line.qtyKg} onChange={(e) => setInputs((prev) => prev.map((v, n) => n === i ? { ...v, qtyKg: e.target.value } : v))} /></Field></div>
        <Button type="button" variant="outline" disabled={inputs.length === 1} onClick={() => setInputs((prev) => prev.filter((_, n) => n !== i))}>{uiText("Remove", "Remove")}</Button>
      </div>)}
      <Button type="button" variant="outline" onClick={() => setInputs((prev) => [...prev, blankInput()])}>{uiText("Add input material", "Input material add karein")}</Button>

      <Field label={`${uiText("Output quantity", "Output quantity")} (${outputUnit})`}><Input required type="number" min="0" step={outputUnit === "pcs" ? "1" : "0.001"} value={outputQty} onChange={(e) => setOutputQty(e.target.value)} /></Field>
      {needsMeasuredMass && <Field label={uiText("Measured output mass (kg) — for conservation only", "Measured output mass (kg) — conservation ke liye")}><Input required type="number" min="0" step="0.001" aria-label="Measured output mass kg" value={outputMassKg} onChange={(e) => setOutputMassKg(e.target.value)} /></Field>}
      <Field label={uiText("Trim / waste / by-product (kg)", "Trim / waste / by-product (kg)")}><Input required type="number" min="0" step="0.001" value={wasteQtyKg} onChange={(e) => setWasteQtyKg(e.target.value)} /></Field>

      <Button type="submit" disabled={busy || !menuItemId}>{busy ? uiText("Recording…", "Record ho raha hai…") : uiText("Record Actual Cutting", "Actual Cutting record karein")}</Button>
    </fieldset></form>

    <div className="space-y-2"><h4 className="text-sm font-medium">{uiText("Actual Cutting history", "Actual Cutting history")}</h4>
      {!loaded ? <p className="text-xs text-muted-foreground">{uiText("Loading…", "Load ho raha hai…")}</p> : <>
        {!records.length && <p className="text-xs text-muted-foreground">{uiText("No Actual Cutting records yet.", "Abhi Actual Cutting records nahi hain.")}</p>}
        <div className="max-h-64 space-y-2 overflow-auto">{records.map((row) => <div key={row.id} className="rounded border p-2 text-xs">
          <p className="font-medium">{items.find((item) => item.id === row.menuItemId)?.name ?? row.menuItemId} · {row.outputQty} {row.outputUnitAtSubmission}</p>
          <p className="mt-1 text-muted-foreground">{uiText("Input", "Input")}: {row.inputs.map((input) => `${input.name} ${input.qtyKg}kg`).join(", ")} · {uiText("Waste", "Waste")}: {row.wasteQtyKg}kg · {uiText("Unaccounted loss", "Unaccounted loss")}: {row.unaccountedLossPercent}%</p>
          <p className="mt-1 font-medium">{uiText("Batch value", "Batch value")}: TSh {row.inputTotalValueTsh} · {uiText("Cost per", "Cost per")} {row.outputUnitAtSubmission}: TSh {row.costPerOutputUnitTsh}</p>
        </div>)}</div>
      </>}
    </div>
  </section>;
}
