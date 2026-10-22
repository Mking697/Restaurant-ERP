"use client";
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
interface StockRow { id: string; branchId: string; rawMaterialId: string; name: string; unit: string; qtyOnHand: string; minStockLevel: string; maxStockLevel: string; isHighValue: boolean; }
const UNITS = ["kg", "g", "ltr", "ml", "pcs", "box", "pack"];
const blank = { name: "", branchId: "", unit: "kg", qtyOnHand: "0", minStockLevel: "0", maxStockLevel: "0" };
const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
export default function InventoryPage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches, error: branchError } = useBranches();
  const allowed = hasCurrentModule(actor, "INVENTORY");
  const [rows, setRows] = React.useState<StockRow[]>([]);
  const [loadedScope, setLoadedScope] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [item, setItem] = React.useState(blank);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scopeKey = `${actor.id}:${selected}`;
  const url = "/api/inventory" + (selected !== "all" ? `?branchId=${encodeURIComponent(selected)}` : "");
  React.useEffect(() => {
    setRows([]); setOpen(false); setMessage("");
    if (!allowed) return;
    let active = true; setLoading(true); setError("");
    requestJson<{ inventory: StockRow[] }>(url).then(data => { if (active) { setRows(data.inventory); setLoadedScope(scopeKey); } }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, url, scopeKey]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!allowed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await requestJson("/api/inventory", { method: "POST", body: JSON.stringify({ ...item, branchId: actor.role === "SUPER_ADMIN" ? item.branchId : actor.branchId }) });
      const data = await requestJson<{ inventory: StockRow[] }>(url);
      setRows(data.inventory); setLoadedScope(scopeKey); setOpen(false); setItem(blank); setMessage("Inventory item saved and reloaded from database.");
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }
  const visibleRows = loadedScope === scopeKey && allowed ? rows : [];
  const low = visibleRows.filter(row => Number(row.qtyOnHand) < Number(row.minStockLevel)).length;
  const over = visibleRows.filter(row => Number(row.maxStockLevel) > 0 && Number(row.qtyOnHand) > Number(row.maxStockLevel)).length;
  return <AppShell activeHref="/inventory">
    <PageHeader title="Inventory" description={`Persisted branch stock and min/max levels. ${low} low-stock, ${over} overstock alerts. Expiry batches and purchase indents are not part of this screen.`}>
      {allowed && <Button size="sm" onClick={() => { setError(""); setMessage(""); setItem({ ...blank, branchId: selected === "all" ? "" : selected }); setOpen(true); }}>Add Item</Button>}
    </PageHeader>
    {!allowed ? <p role="alert">Inventory permission is required.</p> : <>
      {(error || branchError) && <p role="alert" className="mb-4 text-destructive">{error || branchError}</p>}{message && <p role="status" className="mb-4">{message}</p>}
      <Card><CardContent className="pt-5">{loading ? <p>Loading inventory…</p> : <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Branch</TableHead><TableHead>Qty on hand</TableHead><TableHead>Min / Max</TableHead><TableHead>Flags</TableHead></TableRow></TableHeader><TableBody>
        {visibleRows.map(row => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{branches.find(branch => branch.id === row.branchId)?.name ?? "Own branch"}</TableCell><TableCell>{row.qtyOnHand} {row.unit}</TableCell><TableCell>{row.minStockLevel} / {row.maxStockLevel} {row.unit}</TableCell><TableCell className="flex flex-wrap gap-1">{Number(row.qtyOnHand) < Number(row.minStockLevel) && <Badge variant="destructive">Low stock</Badge>}{Number(row.maxStockLevel) > 0 && Number(row.qtyOnHand) > Number(row.maxStockLevel) && <Badge variant="warning">Overstock</Badge>}{row.isHighValue && <Badge variant="outline">High value</Badge>}</TableCell></TableRow>)}
      </TableBody></Table>}{!loading && !error && !visibleRows.length && <p>No inventory in this scope.</p>}</CardContent></Card>
      <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Add Inventory Item</DialogTitle><DialogDescription>Creates stock for one branch. Existing catalog names reuse the same material and unit; this does not create a purchase indent.</DialogDescription></DialogHeader>
        <form onSubmit={save}><fieldset disabled={busy} className="space-y-3">
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <Field label="Item name"><input required className={inputClass} value={item.name} onChange={event => setItem({ ...item, name: event.target.value })} /></Field>
          <Field label="Branch"><select required disabled={actor.role !== "SUPER_ADMIN"} className={inputClass} value={actor.role === "SUPER_ADMIN" ? item.branchId : actor.branchId ?? ""} onChange={event => setItem({ ...item, branchId: event.target.value })}><option value="">Select branch (required)</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></Field>
          <Field label="Unit"><select className={inputClass} value={item.unit} onChange={event => setItem({ ...item, unit: event.target.value })}>{UNITS.map(unit => <option key={unit}>{unit}</option>)}</select></Field>
          {([ ["qtyOnHand", "Opening quantity"], ["minStockLevel", "Minimum stock"], ["maxStockLevel", "Maximum stock (0 = no upper alert)"] ] as const).map(([key, label]) => <Field key={key} label={label}><input required type="number" min="0" step="0.001" className={inputClass} value={item[key]} onChange={event => setItem({ ...item, [key]: event.target.value })} /></Field>)}
          <div className="flex gap-2"><Button type="submit" disabled={actor.role === "SUPER_ADMIN" && !item.branchId}>{busy ? "Saving…" : "Add Item"}</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </fieldset></form>
      </DialogContent></Dialog>
    </>}
  </AppShell>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }

