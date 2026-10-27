"use client";
import { useUiCopy } from "@/lib/ui-copy";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";

interface MenuItemRow { id: string; branchId: string; name: string; category: string; price: string; isActive: boolean; isSemiFg: boolean; isSellable: boolean; }
interface RawMaterialRow { id: string; name: string; unit: string; category: string; }
interface BomRow { id: string; branchId: string; menuItemId: string; componentType: "RAW_MATERIAL" | "SEMI_FG"; rawMaterialId: string | null; componentMenuItemId: string | null; qtyPerUnit: string; lockedByHq: boolean; }
interface ExplodeResult { requirements: { rawMaterialId: string; name: string; unit: string; qty: number; rateAvailable: boolean }[]; estimatedCost: number | null; costNote: string; }

const blankItem = { name: "", branchId: "", category: "", price: "0", isSemiFg: false };
const blankComponent = { componentType: "RAW_MATERIAL" as "RAW_MATERIAL" | "SEMI_FG", rawMaterialId: "", componentMenuItemId: "", qtyPerUnit: "0.100" };
const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";

export default function MenuPage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches, error: branchError } = useBranches();
  const allowed = hasCurrentModule(actor, "MENU_BOM");
  const [items, setItems] = React.useState<MenuItemRow[]>([]);
  const [materials, setMaterials] = React.useState<RawMaterialRow[]>([]);
  const [loadedScope, setLoadedScope] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [itemOpen, setItemOpen] = React.useState(false);
  const [newItem, setNewItem] = React.useState(blankItem);
  const [activeItemId, setActiveItemId] = React.useState("");
  const [recipe, setRecipe] = React.useState<BomRow[]>([]);
  const [recipeLoading, setRecipeLoading] = React.useState(false);
  const [componentOpen, setComponentOpen] = React.useState(false);
  const [newComponent, setNewComponent] = React.useState(blankComponent);
  const [explodeQty, setExplodeQty] = React.useState("1");
  const [explodeResult, setExplodeResult] = React.useState<ExplodeResult | null>(null);
  const [explodeBusy, setExplodeBusy] = React.useState(false);

  const scopeKey = `${actor.id}:${selected}`;
  const itemsUrl = "/api/menu-items" + (selected !== "all" ? `?branchId=${encodeURIComponent(selected)}` : "");

  React.useEffect(() => {
    setItems([]); setActiveItemId(""); setRecipe([]); setMessage("");
    if (!allowed) return;
    let active = true; setLoading(true); setError("");
    Promise.all([requestJson<{ menuItems: MenuItemRow[] }>(itemsUrl), requestJson<{ rawMaterials: RawMaterialRow[] }>("/api/raw-materials")])
      .then(([itemData, materialData]) => { if (active) { setItems(itemData.menuItems); setMaterials(materialData.rawMaterials); setLoadedScope(scopeKey); } })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, itemsUrl, scopeKey]);

  const visibleItems = loadedScope === scopeKey && allowed ? items : [];
  const activeItem = visibleItems.find((item) => item.id === activeItemId) ?? null;
  const semiFgOptions = visibleItems.filter((item) => item.isSemiFg && item.id !== activeItemId);

  async function saveItem(event: React.FormEvent) {
    event.preventDefault(); if (!allowed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await requestJson("/api/menu-items", { method: "POST", body: JSON.stringify({ ...newItem, branchId: actor.role === "SUPER_ADMIN" ? newItem.branchId : actor.branchId }) });
      const data = await requestJson<{ menuItems: MenuItemRow[] }>(itemsUrl);
      setItems(data.menuItems); setLoadedScope(scopeKey); setItemOpen(false); setNewItem(blankItem); setMessage(uiText("Menu item saved."));
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function openRecipe(itemId: string) {
    setActiveItemId(itemId); setRecipe([]); setExplodeResult(null); setError("");
    setRecipeLoading(true);
    try { const data = await requestJson<{ bomRecipes: BomRow[] }>(`/api/bom-recipes?menuItemId=${encodeURIComponent(itemId)}`); setRecipe(data.bomRecipes); }
    catch (err) { setError(err instanceof Error ? err.message : "Load failed"); }
    finally { setRecipeLoading(false); }
  }

  async function saveComponent(event: React.FormEvent) {
    event.preventDefault(); if (!activeItem) return;
    setBusy(true); setError("");
    try {
      await requestJson("/api/bom-recipes", { method: "POST", body: JSON.stringify({
        branchId: activeItem.branchId, menuItemId: activeItem.id, componentType: newComponent.componentType,
        rawMaterialId: newComponent.componentType === "RAW_MATERIAL" ? newComponent.rawMaterialId : null,
        componentMenuItemId: newComponent.componentType === "SEMI_FG" ? newComponent.componentMenuItemId : null,
        qtyPerUnit: newComponent.qtyPerUnit,
      }) });
      const data = await requestJson<{ bomRecipes: BomRow[] }>(`/api/bom-recipes?menuItemId=${encodeURIComponent(activeItem.id)}`);
      setRecipe(data.bomRecipes); setComponentOpen(false); setNewComponent(blankComponent);
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function deleteComponent(id: string) {
    if (!activeItem) return;
    setBusy(true); setError("");
    try {
      await requestJson(`/api/bom-recipes/${id}`, { method: "DELETE" });
      const data = await requestJson<{ bomRecipes: BomRow[] }>(`/api/bom-recipes?menuItemId=${encodeURIComponent(activeItem.id)}`);
      setRecipe(data.bomRecipes);
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); }
    finally { setBusy(false); }
  }

  async function explode() {
    if (!activeItem) return;
    setExplodeBusy(true); setError(""); setExplodeResult(null);
    try { setExplodeResult(await requestJson<ExplodeResult>(`/api/bom-recipes/explode?menuItemId=${encodeURIComponent(activeItem.id)}&qty=${encodeURIComponent(explodeQty)}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Explode failed"); }
    finally { setExplodeBusy(false); }
  }

  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? id;
  const itemName = (id: string) => visibleItems.find((i) => i.id === id)?.name ?? id;

  return <AppShell activeHref="/menu">
    <PageHeader title={uiText("Menu & BOM")} description={uiText("Dishes, Semi-FG bases and their recursive recipe tree. Order-confirm uses this to split KOT/receipt and deduct inventory — see /api/pos/orders.", "Dishes, Semi-FG bases aur unka recursive recipe. Order-confirm isi se KOT/receipt split karta hai aur inventory minus karta hai.")}>
      {allowed && <Button size="sm" onClick={() => { setError(""); setMessage(""); setNewItem({ ...blankItem, branchId: selected === "all" ? "" : selected }); setItemOpen(true); }}>{uiText("Add Menu Item")}</Button>}
    </PageHeader>
    {!allowed ? <p role="alert">{uiText("Menu & BOM permission is required.")}</p> : <>
      {(error || branchError) && <p role="alert" className="mb-4 text-destructive">{uiText(error || branchError)}</p>}{message && <p role="status" className="mb-4">{uiText(message)}</p>}
      <Card><CardContent className="pt-5">{loading ? <p>{uiText("Loading menu…")}</p> : <Table><TableHeader><TableRow><TableHead>{uiText("Item")}</TableHead><TableHead>{uiText("Branch")}</TableHead><TableHead>{uiText("Price")}</TableHead><TableHead>{uiText("Flags")}</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
        {visibleItems.map((item) => <TableRow key={item.id} className={item.id === activeItemId ? "bg-accent/40" : ""}>
          <TableCell>{item.name}</TableCell>
          <TableCell>{branches.find((b) => b.id === item.branchId)?.name ?? uiText("Own branch")}</TableCell>
          <TableCell>₹{item.price}</TableCell>
          <TableCell className="flex flex-wrap gap-1">{item.isSemiFg && <Badge variant="outline">{uiText("Semi-FG")}</Badge>}{!item.isSellable && <Badge variant="outline">{uiText("Not sellable")}</Badge>}</TableCell>
          <TableCell><Button size="sm" variant="outline" onClick={() => openRecipe(item.id)}>{uiText("Recipe")}</Button></TableCell>
        </TableRow>)}
      </TableBody></Table>}{!loading && !error && !visibleItems.length && <p>{uiText("No menu items in this scope.")}</p>}</CardContent></Card>

      {activeItem && <Card className="mt-4"><CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold">{uiText("Recipe for")} {activeItem.name}</h3>
          <Button size="sm" onClick={() => { setError(""); setNewComponent(blankComponent); setComponentOpen(true); }}>{uiText("Add Component")}</Button>
        </div>
        {recipeLoading ? <p>{uiText("Loading recipe…")}</p> : <Table><TableHeader><TableRow><TableHead>{uiText("Component")}</TableHead><TableHead>{uiText("Type")}</TableHead><TableHead>{uiText("Qty per unit")}</TableHead><TableHead>{uiText("Locked")}</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
          {recipe.map((row) => <TableRow key={row.id}>
            <TableCell>{row.componentType === "RAW_MATERIAL" ? materialName(row.rawMaterialId!) : itemName(row.componentMenuItemId!)}</TableCell>
            <TableCell>{row.componentType === "SEMI_FG" ? <Badge variant="outline">{uiText("Semi-FG")}</Badge> : uiText("Raw material")}</TableCell>
            <TableCell>{row.qtyPerUnit}</TableCell>
            <TableCell>{row.lockedByHq ? <Badge variant="outline">{uiText("HQ locked")}</Badge> : ""}</TableCell>
            <TableCell>{(!row.lockedByHq || actor.role === "SUPER_ADMIN") && <Button size="sm" variant="outline" disabled={busy} onClick={() => deleteComponent(row.id)}>{uiText("Remove")}</Button>}</TableCell>
          </TableRow>)}
        </TableBody></Table>}
        {!recipeLoading && !recipe.length && <p>{uiText("No components yet — add raw materials or a Semi-FG base.")}</p>}

        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="block space-y-1 text-xs font-medium"><span>{uiText("Qty ordered")}</span><input type="number" min="1" step="1" className={inputClass + " w-28"} value={explodeQty} onChange={(e) => setExplodeQty(e.target.value)} /></label>
          <Button size="sm" variant="outline" disabled={explodeBusy} onClick={explode}>{explodeBusy ? uiText("Exploding…") : uiText("Explode & Cost (KOT preview)")}</Button>
        </div>
        {explodeResult && <div className="rounded-md border p-3 text-sm space-y-2">
          <p className="font-medium">{uiText("Raw materials required (what inventory will deduct):")}</p>
          <ul className="list-disc pl-5">{explodeResult.requirements.map((req) => <li key={req.rawMaterialId}>{req.name}: {req.qty} {req.unit}{!req.rateAvailable && <span className="text-destructive"> ({uiText("no vendor rate")})</span>}</li>)}</ul>
          <p>{uiText("Estimated cost:")} {explodeResult.estimatedCost !== null ? `₹${explodeResult.estimatedCost}` : uiText("unavailable")}</p>
          <p className="text-xs text-muted-foreground">{explodeResult.costNote}</p>
        </div>}
      </CardContent></Card>}

      <Dialog open={itemOpen} onOpenChange={(v) => { if (!busy) setItemOpen(v); }}><DialogContent><DialogHeader><DialogTitle>{uiText("Add Menu Item")}</DialogTitle><DialogDescription>{uiText("A Semi-FG base (gravy/sauce/marinade) is not directly sellable by default — use it as a component of other dishes below.", "Semi-FG base (gravy/sauce) directly sellable nahi hota by default — niche dusre dishes ke component ke roop mein use karo.")}</DialogDescription></DialogHeader>
        <form onSubmit={saveItem}><fieldset disabled={busy} className="space-y-3">
          {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
          <Field label={uiText("Name")}><input required className={inputClass} value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} /></Field>
          <Field label={uiText("Branch")}><select required disabled={actor.role !== "SUPER_ADMIN"} className={inputClass} value={actor.role === "SUPER_ADMIN" ? newItem.branchId : actor.branchId ?? ""} onChange={(e) => setNewItem({ ...newItem, branchId: e.target.value })}><option value="">{uiText("Select branch (required)")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field>
          <Field label={uiText("Category")}><input className={inputClass} value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} /></Field>
          <Field label={uiText("Price")}><input required type="number" min="0" step="0.01" className={inputClass} value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newItem.isSemiFg} onChange={(e) => setNewItem({ ...newItem, isSemiFg: e.target.checked })} />{uiText("This is a Semi-FG base (not sold directly)")}</label>
          <div className="flex gap-2"><Button type="submit" disabled={actor.role === "SUPER_ADMIN" && !newItem.branchId}>{busy ? uiText("Saving…") : uiText("Add Item")}</Button><Button type="button" variant="outline" onClick={() => setItemOpen(false)}>{uiText("Cancel")}</Button></div>
        </fieldset></form>
      </DialogContent></Dialog>

      <Dialog open={componentOpen} onOpenChange={(v) => { if (!busy) setComponentOpen(v); }}><DialogContent><DialogHeader><DialogTitle>{uiText("Add Recipe Component")}</DialogTitle><DialogDescription>{uiText("Either a raw material or another Semi-FG dish — never both.", "Ya raw material ya dusra Semi-FG dish — dono ek saath nahi.")}</DialogDescription></DialogHeader>
        <form onSubmit={saveComponent}><fieldset disabled={busy} className="space-y-3">
          {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
          <Field label={uiText("Component type")}><select className={inputClass} value={newComponent.componentType} onChange={(e) => setNewComponent({ ...newComponent, componentType: e.target.value as "RAW_MATERIAL" | "SEMI_FG" })}><option value="RAW_MATERIAL">{uiText("Raw material")}</option><option value="SEMI_FG">{uiText("Semi-FG dish")}</option></select></Field>
          {newComponent.componentType === "RAW_MATERIAL"
            ? <Field label={uiText("Raw material")}><select required className={inputClass} value={newComponent.rawMaterialId} onChange={(e) => setNewComponent({ ...newComponent, rawMaterialId: e.target.value })}><option value="">{uiText("Select")}</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select></Field>
            : <Field label={uiText("Semi-FG dish")}><select required className={inputClass} value={newComponent.componentMenuItemId} onChange={(e) => setNewComponent({ ...newComponent, componentMenuItemId: e.target.value })}><option value="">{uiText("Select")}</option>{semiFgOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
          <Field label={uiText("Qty per 1 unit sold")}><input required type="number" min="0.001" step="0.001" className={inputClass} value={newComponent.qtyPerUnit} onChange={(e) => setNewComponent({ ...newComponent, qtyPerUnit: e.target.value })} /></Field>
          <div className="flex gap-2"><Button type="submit">{busy ? uiText("Saving…") : uiText("Add Component")}</Button><Button type="button" variant="outline" onClick={() => setComponentOpen(false)}>{uiText("Cancel")}</Button></div>
        </fieldset></form>
      </DialogContent></Dialog>
    </>}
  </AppShell>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }
