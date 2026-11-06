"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUiCopy } from "@/lib/ui-copy";
import { formatInr } from "@/lib/utils";

export type TileMenuItem = { id: string; branchId: string; name: string; price: string; isActive: boolean; isSellable: boolean; category?: string; imageUrl?: string | null };
export type TileLine = { menuItemId: string; qty: number };

type Props = {
  items: TileMenuItem[];
  lines: TileLine[];
  setLines: React.Dispatch<React.SetStateAction<TileLine[]>>;
  disabled?: boolean;
  view: "tiles" | "list";
  onViewChange: (view: "tiles" | "list") => void;
};

export function MenuTilePicker({ items, lines, setLines, disabled, view, onViewChange }: Props) {
  const uiText = useUiCopy();
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("ALL");
  const categories = React.useMemo(() => ["ALL", ...Array.from(new Set(items.map(item => item.category?.trim() || "Other")))], [items]);
  React.useEffect(() => { if (!categories.includes(category)) setCategory("ALL"); }, [categories, category]);
  const filtered = items.filter(item => (category === "ALL" || (item.category?.trim() || "Other") === category) && item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const qtyFor = (id: string) => lines.find(line => line.menuItemId === id)?.qty ?? 0;
  function setQty(id: string, qty: number) {
    if (disabled) return;
    const bounded = Math.max(0, Math.min(500, Math.round(qty)));
    setLines(current => {
      const exists = current.some(line => line.menuItemId === id);
      if (bounded === 0) return current.filter(line => line.menuItemId !== id);
      if (exists) return current.map(line => line.menuItemId === id ? { ...line, qty: bounded } : line);
      return [...current, { menuItemId: id, qty: bounded }];
    });
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-medium">{uiText("Items")}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => onViewChange(view === "tiles" ? "list" : "tiles")}>{view === "tiles" ? uiText("Switch to list view") : uiText("Switch to tile view")}</Button>
    </div>
    {view === "tiles" && <>
      <Input placeholder={uiText("Search items…")} value={search} onChange={event => setSearch(event.target.value)} />
      <div className="flex flex-wrap gap-2" role="group" aria-label={uiText("Categories")}>
        {categories.map(cat => <button key={cat} type="button" aria-pressed={category === cat} className={"rounded-full border px-3 py-1 text-xs " + (category === cat ? "bg-primary text-primary-foreground" : "")} onClick={() => setCategory(cat)}>{cat === "ALL" ? uiText("All") : cat}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map(item => {
          const qty = qtyFor(item.id);
          const unavailable = !item.isActive || !item.isSellable;
          return <div key={item.id} className={"flex flex-col gap-1 rounded-lg border p-2" + (unavailable ? " opacity-50" : "")}>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
              {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" /> : <span aria-hidden className="text-2xl text-muted-foreground">🍽</span>}
            </div>
            <p className="line-clamp-2 text-xs font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">{formatInr(Number(item.price))}</p>
            {unavailable ? <p className="text-xs text-destructive">{uiText("Unavailable")}</p> : qty > 0 ? (
              <div className="flex items-center justify-between gap-1">
                <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`${uiText("Decrease")} ${item.name}`} onClick={() => setQty(item.id, qty - 1)}>−</Button>
                <span className="text-sm font-semibold">{qty}</span>
                <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`${uiText("Increase")} ${item.name}`} onClick={() => setQty(item.id, qty + 1)}>+</Button>
              </div>
            ) : <Button type="button" size="sm" disabled={disabled} onClick={() => setQty(item.id, 1)}>{uiText("Add")}</Button>}
          </div>;
        })}
      </div>
      {!filtered.length && <p className="text-xs text-muted-foreground">{uiText("No items match this search/category.")}</p>}
    </>}
  </div>;
}
