"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { requestJson, RequestJsonError } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";
import { isProductionIntent, type MenuItemRow, type ProductionIntent } from "./menu-ui-helpers";
import { Field, inputClass } from "./recipe-builder";
interface ProductionRow { id: string; menuItemId: string; name?: string; quantity: string; unit?: string; createdAt?: string; idempotencyKey?: string; }
interface ProductionData { stock: { menuItemId: string; name: string; unit: string; qtyOnHand: string | number }[]; productions: ProductionRow[]; }
export function ProductionPanel({ branchId, identity, items }: { branchId: string; identity: string; items: MenuItemRow[] }) {
  const uiText = useUiCopy();
  const [data, setData] = React.useState<ProductionData | null>(null);
  const [menuItemId, setMenuItemId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [pending, setPending] = React.useState<ProductionIntent | null>(null);
  const [checked, setChecked] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const alive = React.useRef(true);
  const guard = React.useRef(false);
  const key = `restaurant-production-intent:${identity}:${branchId}`;
  const url = `/api/semi-fg/production?branchId=${encodeURIComponent(branchId)}`;
  function clearIntent() { window.sessionStorage.removeItem(key); setPending(null); setChecked(false); }
  async function readback(intent: ProductionIntent | null) {
    const result = await requestJson<ProductionData>(url);
    if (!alive.current) return false;
    setData(result); setChecked(true);
    if (intent && result.productions.some(row => row.idempotencyKey === intent.idempotencyKey && row.menuItemId === intent.menuItemId && Number(row.quantity) === Number(intent.quantity))) {
      clearIntent(); setMessage(uiText("Production confirmed in saved history.", "Production saved history mein confirm ho gayi.")); return true;
    }
    return false;
  }
  React.useEffect(() => {
    alive.current = true;
    let stored: ProductionIntent | null = null;
    try { const value: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "null"); if (isProductionIntent(value, branchId)) { stored = value; setPending(stored); setMenuItemId(stored.menuItemId); setQuantity(stored.quantity); } }
    catch { setError(uiText("Pending production could not be restored. Check saved history before producing.", "Pending production restore nahi hui. Production se pehle saved history check karein.")); }
    void readback(stored).catch(err => { if (alive.current) setError(err.message); }).finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
    // Scope is remounted by the parent; translations must not restart requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url]);
  async function produce(event: React.FormEvent) {
    event.preventDefault(); if (guard.current || !ready || (pending && !checked)) return;
    const intent = pending ?? { branchId, menuItemId, quantity, idempotencyKey: crypto.randomUUID() };
    if (!isProductionIntent(intent, branchId)) { setError(uiText("Select a Semi-FG and a positive quantity (maximum 3 decimals).", "Semi-FG aur positive quantity chunein (maximum 3 decimals).")); return; }
    guard.current = true; setBusy(true); setError(""); setMessage(""); setChecked(false);
    try {
      // Persist BEFORE sending. Never create a new intent after a lost response.
      window.sessionStorage.setItem(key, JSON.stringify(intent)); setPending(intent);
      await requestJson("/api/semi-fg/production", { method: "POST", body: JSON.stringify(intent) });
      if (!alive.current) return;
      const confirmed = await readback(intent);
      if (alive.current && !confirmed) setError(uiText("Production response received; history does not yet confirm it. Check history or retry the same request only.", "Response aa gayi, lekin history mein confirm nahi hui. History check karein ya wahi request retry karein."));
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : uiText("Production failed", "Production fail hui"));
      if (err instanceof RequestJsonError && err.outcome === "rejected") { try { clearIntent(); } catch { /* Retain a blocked intent when storage cannot be cleared. */ } }
      else { try { await readback(intent); } catch { /* Still blocked until a successful explicit readback. */ } }
    } finally { if (alive.current) { setBusy(false); guard.current = false; } }
  }
  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"><div><h3 className="font-semibold">{uiText("Semi-FG production & stock", "Semi-FG production aur stock")}</h3><p className="mt-1 text-xs text-muted-foreground">{uiText("Production consumes direct raw materials and already-stocked Semi-FG, then credits the output. No raw fallback. Selling a dish consumes its Semi-FG stock, not that base’s raw ingredients again.", "Production direct raw material aur pehle se stocked Semi-FG consume karke output stock badhata hai. Raw fallback nahi. Dish sale par Semi-FG stock katega, us base ka raw dobara nahi.")}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    <form onSubmit={produce} className="flex flex-wrap items-end gap-3"><fieldset disabled={busy || !!pending || !ready} className="flex min-w-0 flex-1 flex-wrap gap-3"><div className="min-w-0 flex-1"><Field label={uiText("Semi-FG", "Semi-FG")}><select required className={inputClass} value={menuItemId} onChange={e => setMenuItemId(e.target.value)}><option value="">{uiText("Select", "Chunein")}</option>{items.filter(item => item.isSemiFg && item.isActive && item.branchId === branchId).map(item => <option key={item.id} value={item.id}>{item.name} ({item.outputUnit})</option>)}</select></Field></div><div className="w-36"><Field label={`${uiText("Output quantity", "Taiyar quantity")} (${items.find(item => item.id === menuItemId)?.outputUnit ?? "—"})`}><input required type="number" min="0.001" max="999999.999" step="0.001" className={inputClass} value={quantity} onChange={e => setQuantity(e.target.value)} /></Field></div></fieldset><Button disabled={busy || !ready || !menuItemId || (!!pending && !checked)}>{busy ? uiText("Please wait…") : pending ? uiText("Retry same production", "Wahi production retry karein") : uiText("Record production", "Production record karein")}</Button></form>
    {pending && <p className="text-xs text-amber-600">{uiText("An unresolved request is locked to its original quantity and retry key. Read history before retrying; do not create a replacement request.", "Pending request ki quantity aur retry key locked hain. Retry se pehle history padhein; nayi replacement request na banayein.")}</p>}
    <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (guard.current) return; guard.current = true; setBusy(true); setError(""); try { await readback(pending); } catch (err) { if (alive.current) { setChecked(false); setError(err instanceof Error ? err.message : uiText("Load failed", "Load nahi hua")); } } finally { if (alive.current) { guard.current = false; setBusy(false); } } }}>{uiText("Reload stock & history", "Stock aur history reload karein")}</Button>
    {!data ? <p className="text-sm text-muted-foreground">{uiText("Stock and history are not loaded.", "Stock aur history load nahi hui.")}</p> : <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><h4 className="text-sm font-medium">{uiText("Stock on hand", "Maujooda stock")}</h4>{!data.stock.length && <p className="text-xs text-muted-foreground">{uiText("No produced stock yet.", "Abhi production stock nahi hai.")}</p>}{data.stock.map(row => <div key={row.menuItemId} className="flex justify-between gap-3 rounded border p-2 text-sm"><span>{row.name}</span><span className="shrink-0 font-mono">{row.qtyOnHand} {row.unit}</span></div>)}</div><div className="space-y-2"><h4 className="text-sm font-medium">{uiText("Saved production history", "Saved production history")}</h4>{!data.productions.length && <p className="text-xs text-muted-foreground">{uiText("No production records.", "Production records nahi hain.")}</p>}<div className="max-h-64 space-y-2 overflow-auto">{data.productions.map(row => <div key={row.id} className="rounded border p-2 text-xs"><p className="font-medium">{row.name ?? items.find(item => item.id === row.menuItemId)?.name ?? row.menuItemId} · {row.quantity} {row.unit ?? items.find(item => item.id === row.menuItemId)?.outputUnit}</p>{row.createdAt && <p className="mt-1 text-muted-foreground">{row.createdAt}</p>}<p className="mt-1 break-all text-muted-foreground">{row.id}</p></div>)}</div></div></div>}
  </section>;
}
