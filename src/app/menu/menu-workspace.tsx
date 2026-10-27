"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { RecipeBuilder } from "./recipe-builder";
import { ProductionPanel } from "./production-panel";
import { foodCostPercent, type BomRow, type MenuItemRow, type RawMaterialRow } from "./menu-ui-helpers";

interface ConsumptionRow { type: "RAW_MATERIAL" | "SEMI_FG"; id: string; name: string; unit: string; required: number; available: number; shortage: number; }
interface ExplodeResult {
  requirements: { rawMaterialId: string; name: string; unit: string; qty: number; rateAvailable: boolean }[];
  estimatedCost: number | null; costNote: string; consumption: ConsumptionRow[]; consumptionNote: string;
}

export default function MenuWorkspace() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches, error: branchError } = useBranches();
  const allowed = hasCurrentModule(actor, "MENU_BOM");
  const owner = actor.role === "SUPER_ADMIN";
  const [items, setItems] = React.useState<MenuItemRow[]>([]);
  const [materials, setMaterials] = React.useState<RawMaterialRow[]>([]);
  const [loadedScope, setLoadedScope] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<MenuItemRow | null>(null);
  const [editingRecipe, setEditingRecipe] = React.useState<BomRow[]>([]);

  const [activeItemId, setActiveItemId] = React.useState("");
  const [recipe, setRecipe] = React.useState<BomRow[]>([]);
  const [recipeLoading, setRecipeLoading] = React.useState(false);
  const [explodeQty, setExplodeQty] = React.useState("1");
  const [explodeResult, setExplodeResult] = React.useState<ExplodeResult | null>(null);
  const [explodeBusy, setExplodeBusy] = React.useState(false);

  const scopeKey = `${actor.id}:${selected}`;
  const itemsUrl = "/api/menu-items" + (selected !== "all" ? `?branchId=${encodeURIComponent(selected)}` : "");

  const load = React.useCallback(async () => {
    const [itemData, materialData] = await Promise.all([
      requestJson<{ menuItems: MenuItemRow[] }>(itemsUrl),
      requestJson<{ rawMaterials: RawMaterialRow[] }>("/api/raw-materials"),
    ]);
    setItems(itemData.menuItems); setMaterials(materialData.rawMaterials); setLoadedScope(scopeKey);
  }, [itemsUrl, scopeKey]);

  React.useEffect(() => {
    setItems([]); setActiveItemId(""); setRecipe([]); setExplodeResult(null); setMessage("");
    if (!allowed) return;
    let active = true; setLoading(true); setError("");
    load().catch(err => { if (active) setError(err instanceof Error ? err.message : "Load failed"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, load]);

  const visibleItems = loadedScope === scopeKey && allowed ? items : [];
  const activeItem = visibleItems.find(item => item.id === activeItemId) ?? null;

  async function openRecipe(itemId: string) {
    setActiveItemId(itemId); setRecipe([]); setExplodeResult(null); setError("");
    setRecipeLoading(true);
    try { const data = await requestJson<{ bomRecipes: BomRow[] }>(`/api/bom-recipes?menuItemId=${encodeURIComponent(itemId)}`); setRecipe(data.bomRecipes); }
    catch (err) { setError(err instanceof Error ? err.message : "Load failed"); }
    finally { setRecipeLoading(false); }
  }

  async function openBuilder(item: MenuItemRow | null) {
    setError(""); setMessage("");
    if (!item) { setEditingItem(null); setEditingRecipe([]); setBuilderOpen(true); return; }
    try {
      const data = await requestJson<{ bomRecipes: BomRow[] }>(`/api/bom-recipes?menuItemId=${encodeURIComponent(item.id)}`);
      setEditingItem(item); setEditingRecipe(data.bomRecipes); setBuilderOpen(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Load failed"); }
  }

  async function explode() {
    if (!activeItem) return;
    setExplodeBusy(true); setError(""); setExplodeResult(null);
    try { setExplodeResult(await requestJson<ExplodeResult>(`/api/bom-recipes/explode?menuItemId=${encodeURIComponent(activeItem.id)}&qty=${encodeURIComponent(explodeQty)}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Explode failed"); }
    finally { setExplodeBusy(false); }
  }

  const materialName = (id: string) => materials.find(m => m.id === id)?.name ?? id;
  const itemName = (id: string) => visibleItems.find(i => i.id === id)?.name ?? id;

  return <AppShell activeHref="/menu">
    <PageHeader title={uiText("Menu & BOM")} description={uiText(
      "Dishes, Semi-FG bases and their recipe tree. Saving a recipe never touches stock — production and sale do.",
      "Dishes, Semi-FG bases aur unki recipe. Recipe save karne se stock nahi badalta — production aur sale se badalta hai."
    )}>
      {allowed && <Button size="sm" onClick={() => openBuilder(null)}>{uiText("Recipe Builder", "Recipe banayein")}</Button>}
    </PageHeader>
    {!allowed ? <p role="alert">{uiText("Menu & BOM permission is required.", "Menu & BOM ki permission chahiye.")}</p> : <>
      {(error || branchError) && <p role="alert" className="mb-4 text-destructive">{error || branchError}</p>}
      {message && <p role="status" className="mb-4">{message}</p>}
      <Card><CardContent className="pt-5">
        {loading ? <p>{uiText("Loading menu…", "Menu load ho raha hai…")}</p> : <Table><TableHeader><TableRow>
          <TableHead>{uiText("Item")}</TableHead><TableHead>{uiText("Branch")}</TableHead>
          <TableHead>{uiText("Price")}</TableHead><TableHead>{uiText("Output unit", "Output unit")}</TableHead>
          <TableHead>{uiText("Flags")}</TableHead><TableHead></TableHead>
        </TableRow></TableHeader><TableBody>
          {visibleItems.map(item => <TableRow key={item.id} className={item.id === activeItemId ? "bg-accent/40" : ""}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{branches.find(b => b.id === item.branchId)?.name ?? uiText("Own branch", "Apni branch")}</TableCell>
            <TableCell>₹{item.price}</TableCell>
            <TableCell>{item.outputUnit}</TableCell>
            <TableCell className="flex flex-wrap gap-1">
              {item.isSemiFg && <Badge variant="outline">{uiText("Semi-FG")}</Badge>}
              {!item.isSellable && <Badge variant="outline">{uiText("Not sellable", "Nahi bikta")}</Badge>}
            </TableCell>
            <TableCell className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openRecipe(item.id)}>{uiText("View recipe", "Recipe dekhein")}</Button>
              <Button size="sm" variant="outline" onClick={() => openBuilder(item)}>{uiText("Edit recipe", "Recipe badlein")}</Button>
            </TableCell>
          </TableRow>)}
        </TableBody></Table>}
        {!loading && !error && !visibleItems.length && <p>{uiText("No menu items in this scope.", "Is scope mein koi menu item nahi hai.")}</p>}
      </CardContent></Card>

      {activeItem && <Card className="mt-4"><CardContent className="pt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{uiText("Recipe for", "Recipe —")} {activeItem.name}</h3>
          <Badge variant="outline">{uiText("Per 1", "Har 1 ke liye")} {activeItem.outputUnit}</Badge>
        </div>
        {recipeLoading ? <p>{uiText("Loading recipe…", "Recipe load ho rahi hai…")}</p> : <Table><TableHeader><TableRow>
          <TableHead>{uiText("Component")}</TableHead><TableHead>{uiText("Type")}</TableHead>
          <TableHead>{uiText("Qty per unit", "Qty per unit")}</TableHead><TableHead>{uiText("Locked")}</TableHead>
        </TableRow></TableHeader><TableBody>
          {recipe.map(row => <TableRow key={row.id}>
            <TableCell>{row.componentType === "RAW_MATERIAL" ? materialName(row.rawMaterialId!) : itemName(row.componentMenuItemId!)}</TableCell>
            <TableCell>{row.componentType === "SEMI_FG" ? <Badge variant="outline">{uiText("Semi-FG")}</Badge> : uiText("Raw material", "Raw material")}</TableCell>
            <TableCell>{row.qtyPerUnit}</TableCell>
            <TableCell>{row.lockedByHq ? <Badge variant="outline">{uiText("HQ locked", "HQ locked")}</Badge> : ""}</TableCell>
          </TableRow>)}
        </TableBody></Table>}
        {!recipeLoading && !recipe.length && <p>{uiText("No recipe saved yet — use Edit recipe to add ingredients.", "Abhi recipe save nahi hui — ingredients add karne ke liye Edit recipe use karein.")}</p>}

        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="block space-y-1 text-xs font-medium"><span>{uiText("Qty ordered", "Kitni qty")}</span>
            <input type="number" min="1" step="1" className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm" value={explodeQty} onChange={e => setExplodeQty(e.target.value)} />
          </label>
          <Button size="sm" variant="outline" disabled={explodeBusy || !recipe.length} onClick={explode}>{explodeBusy ? uiText("Checking…", "Check ho raha hai…") : uiText("Preview stock & cost", "Stock & cost dekhein")}</Button>
        </div>
        {explodeResult && <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm space-y-2">
            <p className="font-medium">{uiText("Theoretical raw requirement (costing only):", "Theoretical raw requirement (sirf costing ke liye):")}</p>
            <ul className="list-disc pl-5">{explodeResult.requirements.map(req => <li key={req.rawMaterialId}>{req.name}: {req.qty} {req.unit}{!req.rateAvailable && <span className="text-destructive"> ({uiText("no vendor rate", "vendor rate nahi hai")})</span>}</li>)}</ul>
            <p>{uiText("Estimated cost:", "Andaazan cost:")} {explodeResult.estimatedCost !== null ? `₹${explodeResult.estimatedCost}` : uiText("unavailable", "available nahi")}
              {explodeResult.estimatedCost !== null && <> · {uiText("Food cost", "Food cost")} {(() => { const pct = foodCostPercent(explodeResult.estimatedCost, activeItem.price, explodeQty); return pct === null ? "—" : `${pct.toFixed(1)}%`; })()}</>}
            </p>
            <p className="text-xs text-muted-foreground">{explodeResult.costNote}</p>
          </div>
          <div className="rounded-md border p-3 text-sm space-y-2">
            <p className="font-medium">{uiText("Direct stock this will actually consume:", "Yeh direct stock actually consume hoga:")}</p>
            <Table><TableHeader><TableRow>
              <TableHead>{uiText("Ingredient")}</TableHead><TableHead>{uiText("Required", "Zaroori")}</TableHead>
              <TableHead>{uiText("Available", "Available")}</TableHead><TableHead>{uiText("Shortage", "Kami")}</TableHead>
            </TableRow></TableHeader><TableBody>
              {explodeResult.consumption.map(row => <TableRow key={row.type + ":" + row.id}>
                <TableCell>{row.name} {row.type === "SEMI_FG" && <Badge variant="outline">{uiText("Semi-FG")}</Badge>}</TableCell>
                <TableCell>{row.required} {row.unit}</TableCell><TableCell>{row.available} {row.unit}</TableCell>
                <TableCell>{row.shortage > 0 ? <span className="text-destructive">{row.shortage} {row.unit}</span> : "—"}</TableCell>
              </TableRow>)}
            </TableBody></Table>
            <p className="text-xs text-muted-foreground">{explodeResult.consumptionNote}</p>
          </div>
        </div>}
      </CardContent></Card>}

      {actor.branchId && <ProductionPanel branchId={actor.branchId} identity={actor.id} items={visibleItems} />}
      {!actor.branchId && selected !== "all" && <ProductionPanel branchId={selected} identity={actor.id} items={visibleItems} />}

      {builderOpen && <RecipeBuilder
        item={editingItem} recipe={editingRecipe} items={visibleItems} materials={materials}
        branches={branches} branchId={actor.branchId ?? (selected !== "all" ? selected : "")} owner={owner}
        onClose={() => setBuilderOpen(false)}
        onSaved={async () => { await load(); if (editingItem) await openRecipe(editingItem.id); setMessage(uiText("Recipe saved.", "Recipe save ho gayi.")); }}
      />}
    </>}
  </AppShell>;
}
