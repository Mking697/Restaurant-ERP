"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUiCopy } from "@/lib/ui-copy";
import { requestJson, RequestJsonError } from "@/lib/current-user";
import { eligibleSemiFg, normalizeQuantity, recipeComponents, type BomRow, type IngredientDraft, type MenuItemRow, type RawMaterialRow } from "./menu-ui-helpers";
export const inputClass = "w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
export function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block min-w-0 space-y-1.5 text-xs font-medium"><span>{label}</span>{children}</label>; }
const newRow = (): IngredientDraft => ({ key: crypto.randomUUID(), componentType: "RAW_MATERIAL", componentId: "", quantity: "", search: "", locked: false });
export function RecipeBuilder({ item, recipe, items, materials, branches, branchId, owner, onClose, onSaved }: {
  item: MenuItemRow | null; recipe: BomRow[]; items: MenuItemRow[]; materials: RawMaterialRow[]; branches: { id: string; name: string }[]; branchId: string; owner: boolean; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const uiText = useUiCopy();
  const [metadata, setMetadata] = React.useState({ name: item?.name ?? "", branchId: item?.branchId ?? branchId, category: item?.category ?? "", price: item?.price ?? "0", outputUnit: item?.outputUnit ?? "portion", isSemiFg: item?.isSemiFg ?? false });
  const [rows, setRows] = React.useState<IngredientDraft[]>(() => recipe.length ? recipe.map(row => ({ key: row.id, componentType: row.componentType, componentId: row.rawMaterialId ?? row.componentMenuItemId ?? "", quantity: row.qtyPerUnit, search: "", locked: row.lockedByHq && !owner })) : [newRow()]);
  const [recipeYield, setRecipeYield] = React.useState("1");
  const [busy, setBusy] = React.useState(false);
  const [uncertain, setUncertain] = React.useState(false);
  const [error, setError] = React.useState("");
  const alive = React.useRef(true);
  const submitting = React.useRef(false);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const options = eligibleSemiFg(items, metadata.branchId, item?.id);
  const update = (key: string, patch: Partial<IngredientDraft>) => setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (submitting.current || uncertain) return;
    setError("");
    let components;
    try {
      components = recipeComponents(rows, recipeYield);
      for (const row of rows) {
        if (row.componentType === "SEMI_FG" && !options.some(option => option.id === row.componentId) && !row.locked) throw new Error(uiText("Select an active Semi-FG from this branch.", "Isi branch ka active Semi-FG chunein."));
      }
    } catch (err) { setError(err instanceof Error ? err.message : uiText("Invalid recipe", "Recipe sahi nahi hai")); return; }
    submitting.current = true; setBusy(true);
    try {
      await requestJson(item ? "/api/bom-recipes" : "/api/menu-items", { method: item ? "PUT" : "POST", body: JSON.stringify(item ? { menuItemId: item.id, branchId: item.branchId, components } : { ...metadata, components }) });
      if (!alive.current) return;
      await onSaved();
      if (alive.current) onClose();
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : uiText("Save failed"));
      if (err instanceof RequestJsonError && err.outcome === "unknown") setUncertain(true);
    } finally { if (alive.current) { setBusy(false); submitting.current = false; } }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-5xl max-h-[92dvh] p-4 sm:p-6"><DialogHeader>
    <DialogTitle>{item ? uiText("Edit recipe", "Recipe badlein") : uiText("Recipe Builder", "Recipe banayein")}</DialogTitle>
    <DialogDescription>{uiText("Create a dish and all its ingredients in one save. Saving a recipe never deducts stock.", "Dish aur saare ingredients ek saath save karein. Recipe save karne se stock nahi katega.")}</DialogDescription>
  </DialogHeader><form onSubmit={save}><fieldset disabled={busy || uncertain} className="min-w-0 space-y-5">
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <section className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2"><Field label={uiText("Dish / Semi-FG name", "Dish / Semi-FG ka naam")}><input required maxLength={120} disabled={!!item} className={inputClass} value={metadata.name} onChange={e => setMetadata({ ...metadata, name: e.target.value })} /></Field></div>
      <Field label={uiText("Branch")}><select required className={inputClass} disabled={!!item || !owner} value={metadata.branchId} onChange={e => { setMetadata({ ...metadata, branchId: e.target.value }); setRows([newRow()]); }}><option value="">{uiText("Select branch")}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
      <Field label={uiText("Item type", "Item ka type")}><select className={inputClass} disabled={!!item} value={metadata.isSemiFg ? "SEMI_FG" : "DISH"} onChange={e => setMetadata({ ...metadata, isSemiFg: e.target.value === "SEMI_FG", outputUnit: e.target.value === "SEMI_FG" ? "kg" : "portion" })}><option value="DISH">{uiText("Sellable dish", "Bechne wali dish")}</option><option value="SEMI_FG">{uiText("Semi-FG base", "Semi-FG base")}</option></select></Field>
      <Field label={uiText("Category", "Category")}><input disabled={!!item} className={inputClass} value={metadata.category} onChange={e => setMetadata({ ...metadata, category: e.target.value })} /></Field>
      <Field label={uiText("Selling price (₹)", "Bechne ki keemat (₹)")}><input required disabled={!!item} type="number" min="0" step="0.01" className={inputClass} value={metadata.price} onChange={e => setMetadata({ ...metadata, price: e.target.value })} /></Field>
      <Field label={uiText("Output unit", "Taiyar item ki unit")}><input required disabled={!!item} maxLength={20} list="recipe-output-units" className={inputClass} value={metadata.outputUnit} onChange={e => setMetadata({ ...metadata, outputUnit: e.target.value })} /><datalist id="recipe-output-units">{["portion", "kg", "ltr", "pcs"].map(unit => <option key={unit} value={unit} />)}</datalist></Field>
      <Field label={uiText("Recipe yield (batch output)", "Recipe yield (batch mein taiyar quantity)")}><input required type="number" min="0.001" step="any" disabled={rows.some(row => row.locked)} className={inputClass} value={recipeYield} onChange={e => setRecipeYield(e.target.value)} /></Field>
      {item && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">{uiText("Only the ingredient recipe is updated here; existing item details stay unchanged. HQ-locked ingredients cannot be changed by branch users.", "Yahan sirf ingredient recipe badlegi; item details wahi rahengi. Branch users HQ-locked ingredients nahi badal sakte.")}</p>}
    </section>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{uiText("Ingredients", "Ingredients")} <span className="text-muted-foreground">({rows.length})</span></h3><Badge variant="outline">{uiText("Auto unit · normalized per 1 output", "Auto unit · har 1 output ke hisaab se")}</Badge></div>
      <p className="text-xs text-muted-foreground">{uiText("Enter all quantities for the batch yield above. Each row is divided by yield and rounded to 3 decimals when saved.", "Upar diye batch yield ke liye quantity bharein. Save par har quantity yield se divide hokar 3 decimals mein save hogi.")}</p>
      {rows.map((row, index) => {
        const candidates = row.componentType === "RAW_MATERIAL" ? materials : options;
        const selected = candidates.find(candidate => candidate.id === row.componentId);
        const filtered = candidates.filter(candidate => candidate.id === row.componentId || candidate.name.toLocaleLowerCase().includes(row.search.toLocaleLowerCase()));
        const unit = row.componentType === "RAW_MATERIAL" ? materials.find(material => material.id === row.componentId)?.unit : items.find(option => option.id === row.componentId)?.outputUnit;
        let normalized = "—"; try { normalized = normalizeQuantity(row.quantity, recipeYield); } catch { /* Incomplete draft, not a saved quantity. */ }
        return <div key={row.key} className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-[140px_minmax(0,1fr)_130px_90px_100px_40px]">
          <Field label={`${index + 1}. ${uiText("Type")}`}><select disabled={row.locked} className={inputClass} value={row.componentType} onChange={e => update(row.key, { componentType: e.target.value as IngredientDraft["componentType"], componentId: "", search: "" })}><option value="RAW_MATERIAL">{uiText("Raw material", "Raw material")}</option><option value="SEMI_FG">{uiText("Semi-FG", "Semi-FG")}</option></select></Field>
          <div className="min-w-0 space-y-1.5"><Field label={uiText("Search ingredient", "Ingredient khojein")}><input disabled={row.locked} className={inputClass} value={row.search} onChange={e => update(row.key, { search: e.target.value })} placeholder={uiText("Type to filter…", "Naam likhkar khojein…")} /></Field><select aria-label={`${uiText("Ingredient", "Ingredient")} ${index + 1}`} required disabled={row.locked || !metadata.branchId} className={inputClass} value={row.componentId} onChange={e => update(row.key, { componentId: e.target.value })}><option value="">{uiText("Select ingredient", "Ingredient chunein")}</option>{!selected && row.componentId && <option value={row.componentId}>{items.find(option => option.id === row.componentId)?.name ?? row.componentId} ({uiText("Unavailable", "Available nahi")})</option>}{filtered.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></div>
          <Field label={uiText("Batch quantity", "Batch quantity")}><input required disabled={row.locked} type="number" min="0.000001" step="any" className={inputClass} value={row.quantity} onChange={e => update(row.key, { quantity: e.target.value })} /></Field>
          <Field label={uiText("Unit")}><input readOnly className={inputClass + " bg-muted/40"} value={unit ?? "—"} /></Field>
          <div className="space-y-2 text-xs"><span className="font-medium">{uiText("Per 1", "Har 1 ke liye")} {metadata.outputUnit}</span><p className="font-mono">{normalized}</p>{row.locked && <Badge variant="outline">{uiText("HQ locked", "HQ locked")}</Badge>}</div>
          <Button type="button" variant="ghost" size="icon" disabled={row.locked} aria-label={`${uiText("Remove ingredient", "Ingredient hatayein")} ${index + 1}`} onClick={() => setRows(current => current.filter(candidate => candidate.key !== row.key))}><Trash2 className="size-4" /></Button>
        </div>;
      })}
      <Button type="button" variant="outline" onClick={() => setRows(current => [...current, newRow()])}><Plus className="mr-2 size-4" />{uiText("Add Item")}</Button>
    </section>
    <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><p className="max-w-md text-xs text-muted-foreground">{uiText("One atomic save: dish + complete recipe. No inventory movement.", "Ek atomic save: dish aur poori recipe. Stock nahi badlega.")}</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>{uiText("Cancel")}</Button><Button type="submit" disabled={!metadata.branchId || !rows.length}>{busy ? uiText("Saving…") : uiText("Save recipe", "Recipe save karein")}</Button></div></div>
  </fieldset>{uncertain && <div className="mt-3 space-y-2 rounded border p-3 text-sm"><p>{uiText("Save outcome is unknown. Close and reload saved records before creating or editing again.", "Save ka result confirm nahi hua. Band karke saved records reload karein, phir dobara badlein.")}</p><Button type="button" variant="outline" onClick={async () => { if (submitting.current) return; submitting.current = true; try { await onSaved(); if (alive.current) onClose(); } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : uiText("Load failed", "Load nahi hua")); } finally { submitting.current = false; } }}>{uiText("Reload saved records", "Saved records reload karein")}</Button></div>}</form></DialogContent></Dialog>;
}
