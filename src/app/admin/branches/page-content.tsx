"use client";
import { useUiCopy } from "@/lib/ui-copy";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requestJson, useCurrentUser } from "@/lib/current-user";
import { notifyBranchesChanged, useBranches, type BranchRecord } from "@/lib/current-branch";
const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
export default function BranchesAdminPage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const { branches, loading, error: loadError } = useBranches();
  const owner = actor.role === "SUPER_ADMIN";
  const allowed = actor.ready && actor.authenticated && actor.status === "Active" && !actor.error && (owner || actor.role === "BRANCH_MANAGER");
  const [editing, setEditing] = React.useState<BranchRecord | null>(null);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [cloning, setCloning] = React.useState<{ sourceBranchId: string; code: string; name: string; address: string; lat: string; lng: string; geofenceRadiusM: number } | null>(null);
  const [cloneError, setCloneError] = React.useState("");
  const [cloneBusy, setCloneBusy] = React.useState(false);
  React.useEffect(() => { setEditing(null); setMessage(""); setCloning(null); setCloneError(""); }, [actor.id, actor.role, actor.branchId]);
  function create() { setError(""); setMessage(""); setEditing({ id: "", code: "", name: "", address: "", lat: "0", lng: "0", geofenceRadiusM: 50 }); }
  function openClone() { setMessage(""); setCloneError(""); setCloning({ sourceBranchId: "", code: "", name: "", address: "", lat: "0", lng: "0", geofenceRadiusM: 50 }); }
  async function saveClone(event: React.FormEvent) {
    event.preventDefault(); if (!cloning || !allowed || !owner) return;
    setCloneBusy(true); setCloneError("");
    try {
      const { sourceBranchId, ...fields } = cloning;
      const data = await requestJson<{ branch: BranchRecord; copied: { menuItems: number; bomRecipes: number; checklistTemplates: number } }>("/api/branches/clone", { method: "POST", body: JSON.stringify({ sourceBranchId, ...fields }) });
      notifyBranchesChanged(); setCloning(null);
      setMessage(`${uiText("Branch cloned.", "Branch clone ho gayi.")} ${uiText("Copied", "Copy hua")}: ${data.copied.menuItems} ${uiText("menu items", "menu items")}, ${data.copied.bomRecipes} ${uiText("recipes", "recipes")}, ${data.copied.checklistTemplates} ${uiText("checklist steps", "checklist steps")}.`);
    } catch (err) { setCloneError(err instanceof Error ? err.message : "Clone failed"); }
    finally { setCloneBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editing || !allowed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { id, ...fields } = editing;
      const data = await requestJson<{ branch: BranchRecord }>(id ? `/api/branches/${encodeURIComponent(id)}` : "/api/branches", { method: id ? "PATCH" : "POST", body: JSON.stringify(fields) });
      await requestJson(`/api/branches/${encodeURIComponent(data.branch.id)}`);
      notifyBranchesChanged(); setEditing(null); setMessage("Branch saved and read back from database.");
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }
  return <AppShell activeHref="/admin/branches">
    <PageHeader title={uiText("Branches")} description={uiText("Owner creates branches; Branch Admin maintains own branch details. Clone Branch copies menu, recipes and branch checklists from an existing branch into a new one — stock, users, vendor rates, recurring tasks and historical/transactional data are never copied.", "Owner branch banata hai; Branch Admin apni branch ki details badalta hai. Clone Branch kisi existing branch ka menu, recipes aur branch checklists nayi branch mein copy karta hai — stock, users, vendor rates, recurring tasks aur historical/transactional data kabhi copy nahi hote.")}>
      {allowed && owner && <Button variant="outline" size="sm" onClick={openClone}>{uiText("Clone Branch", "Branch clone karein")}</Button>}{allowed && owner && <Button size="sm" onClick={create}>{uiText("New Branch")}</Button>}
    </PageHeader>
    {(error || loadError) && <p role="alert" className="mb-4 text-destructive">{error || loadError}</p>}
    {message && <p role="status" className="mb-4">{uiText(message)}</p>}
    <Card><CardContent className="pt-5">{loading ? <p>{uiText("Loading branches…")}</p> : <Table><TableHeader><TableRow><TableHead>{uiText("Code")}</TableHead><TableHead>{uiText("Branch")}</TableHead><TableHead>{uiText("Address")}</TableHead><TableHead>{uiText("Coordinates")}</TableHead><TableHead>{uiText("Geofence")}</TableHead><TableHead>{uiText("Action")}</TableHead></TableRow></TableHeader><TableBody>
      {branches.map(branch => <TableRow key={branch.id}><TableCell>{branch.code}</TableCell><TableCell>{branch.name}</TableCell><TableCell>{branch.address || "—"}</TableCell><TableCell>{branch.lat}, {branch.lng}</TableCell><TableCell>{branch.geofenceRadiusM} {uiText(" m")}</TableCell><TableCell>{allowed && <Button size="sm" variant="ghost" onClick={() => { setError(""); setMessage(""); setEditing({ ...branch }); }}>{uiText("Edit")}</Button>}</TableCell></TableRow>)}
    </TableBody></Table>}{!loading && !loadError && !branches.length && <p>{uiText("No branches yet.")}</p>}</CardContent></Card>
    <Dialog open={!!editing && allowed} onOpenChange={open => { if (!open && !busy) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>{editing?.id ? uiText("Edit Branch") : uiText("New Branch")}</DialogTitle><DialogDescription>{uiText("Changes are saved to PostgreSQL. New branches start empty.")}</DialogDescription></DialogHeader>
      {editing && <form onSubmit={save}><fieldset disabled={busy} className="space-y-3">
        {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
        <Field label={uiText("Code")}><input required pattern="[A-Za-z0-9_-]+" maxLength={30} disabled={!owner} className={inputClass} value={editing.code} onChange={event => setEditing({ ...editing, code: event.target.value })} /></Field>
        <Field label={uiText("Name")}><input required className={inputClass} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></Field>
        <Field label={uiText("Address")}><input maxLength={1000} className={inputClass} value={editing.address} onChange={event => setEditing({ ...editing, address: event.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label={uiText("Latitude")}><input required type="number" step="any" min={-90} max={90} className={inputClass} value={editing.lat} onChange={event => setEditing({ ...editing, lat: event.target.value })} /></Field><Field label={uiText("Longitude")}><input required type="number" step="any" min={-180} max={180} className={inputClass} value={editing.lng} onChange={event => setEditing({ ...editing, lng: event.target.value })} /></Field></div>
        <Field label={uiText("Geofence radius (metres)")}><input required type="number" step={1} min={1} max={10000} className={inputClass} value={editing.geofenceRadiusM} onChange={event => setEditing({ ...editing, geofenceRadiusM: Number(event.target.value) })} /></Field>
        {allowed && owner && editing.id && !loading && !loadError && branches.some(branch => branch.id === editing.id) && <DeletionReadiness key={JSON.stringify([actor.id, actor.role, actor.branchId, actor.moduleAccess, editing.id])} branchId={editing.id} />}
        <div className="flex gap-2"><Button type="submit">{busy ? uiText("Saving…") : uiText("Save")}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>{uiText("Cancel")}</Button></div>
      </fieldset></form>}
    </DialogContent></Dialog>
    <Dialog open={!!cloning && allowed && owner} onOpenChange={open => { if (!open && !cloneBusy) setCloning(null); }}><DialogContent><DialogHeader><DialogTitle>{uiText("Clone Branch", "Branch clone karein")}</DialogTitle><DialogDescription>{uiText("Pick a source branch, then enter the new branch's own code/name/address/geofence.", "Pehle source branch chunein, phir nayi branch ka apna code/name/address/geofence bharein.")}</DialogDescription></DialogHeader>
      {cloning && <form onSubmit={saveClone}><fieldset disabled={cloneBusy} className="space-y-3">
        {cloneError && <p role="alert" className="text-destructive">{uiText(cloneError)}</p>}
        <Field label={uiText("Source branch", "Source branch")}><select required className={inputClass} value={cloning.sourceBranchId} onChange={event => setCloning({ ...cloning, sourceBranchId: event.target.value })}>
          <option value="">{uiText("Select branch", "Branch chunein")}</option>
          {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}
        </select></Field>
        <Field label={uiText("New branch code", "Nayi branch ka code")}><input required pattern="[A-Za-z0-9_-]+" maxLength={30} className={inputClass} value={cloning.code} onChange={event => setCloning({ ...cloning, code: event.target.value })} /></Field>
        <Field label={uiText("New branch name", "Nayi branch ka naam")}><input required className={inputClass} value={cloning.name} onChange={event => setCloning({ ...cloning, name: event.target.value })} /></Field>
        <Field label={uiText("Address")}><input maxLength={1000} className={inputClass} value={cloning.address} onChange={event => setCloning({ ...cloning, address: event.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label={uiText("Latitude")}><input required type="number" step="any" min={-90} max={90} className={inputClass} value={cloning.lat} onChange={event => setCloning({ ...cloning, lat: event.target.value })} /></Field><Field label={uiText("Longitude")}><input required type="number" step="any" min={-180} max={180} className={inputClass} value={cloning.lng} onChange={event => setCloning({ ...cloning, lng: event.target.value })} /></Field></div>
        <Field label={uiText("Geofence radius (metres)")}><input required type="number" step={1} min={1} max={10000} className={inputClass} value={cloning.geofenceRadiusM} onChange={event => setCloning({ ...cloning, geofenceRadiusM: Number(event.target.value) })} /></Field>
        <p className="text-xs text-muted-foreground">{uiText("Copied from the source branch: menu items, recipes (BOM) with HQ-lock state preserved, and that branch's own checklist templates. Global checklists are already shared and are not duplicated. NOT copied: inventory stock, vendor rates, users, recurring task definitions/instances, POS orders or any other historical/transactional data.", "Source branch se copy hota hai: menu items, recipes (BOM) HQ-lock state ke saath, aur us branch ke apne checklist templates. Global checklists pehle se sabhi branches mein shared hain, isliye duplicate nahi hote. COPY NAHI hota: inventory stock, vendor rates, users, recurring task definitions/instances, POS orders ya koi bhi doosra historical/transactional data.")}</p>
        <div className="flex gap-2"><Button type="submit">{cloneBusy ? uiText("Cloning…", "Clone ho raha hai…") : uiText("Clone Branch", "Branch clone karein")}</Button><Button type="button" variant="outline" onClick={() => setCloning(null)}>{uiText("Cancel")}</Button></div>
      </fieldset></form>}
    </DialogContent></Dialog>
  </AppShell>;
}
type Readiness = { branchId: string; canDelete: boolean; dependencies: { group: string; count: number }[] };
function DeletionReadiness({ branchId }: { branchId: string }) {
  const uiText = useUiCopy();
  const [state, setState] = React.useState<{ status: "idle" | "loading" | "error" | "done"; result?: Readiness }>({ status: "idle" });
  const lifecycle = React.useRef({ active: true, sequence: 0, controller: null as AbortController | null });
  React.useEffect(() => {
    const current = lifecycle.current;
    current.active = true;
    return () => { current.active = false; current.sequence++; current.controller?.abort(); };
  }, []);
  async function check() {
    const current = lifecycle.current;
    if (!current.active) return;
    current.controller?.abort();
    const controller = new AbortController(); current.controller = controller;
    const sequence = ++current.sequence;
    setState({ status: "loading" });
    try {
      const result = await requestJson<Readiness>(`/api/branches/${encodeURIComponent(branchId)}/deletion-check`, { method: "GET", signal: controller.signal });
      if (!current.active || sequence !== current.sequence) return;
      const groups = new Set<string>();
      if (result?.branchId !== branchId || typeof result.canDelete !== "boolean" || !Array.isArray(result.dependencies) || result.dependencies.some(row => {
        if (!row || typeof row.group !== "string" || !row.group || groups.has(row.group) || !Number.isSafeInteger(row.count) || row.count <= 0) return true;
        groups.add(row.group); return false;
      }) || result.canDelete !== (result.dependencies.length === 0)) throw new Error("Invalid deletion check");
      setState({ status: "done", result });
    } catch {
      if (current.active && sequence === current.sequence) setState({ status: "error" });
    }
  }
  return <section className="space-y-2 rounded-md border p-3 text-sm">
    <p>{uiText("Read-only snapshot only; the server rechecks linked records on every deletion request. No automatic cleanup or reassignment is performed.", "Yeh sirf read-only snapshot hai; har deletion request par server linked records dobara check karta hai. Koi automatic cleanup ya reassignment nahi hota.")}</p>
    <Button type="button" variant="outline" disabled={state.status === "loading"} onClick={check}>{state.status === "loading" ? uiText("Checking deletion readiness…", "Deletion readiness check ho rahi hai…") : state.status === "error" ? uiText("Retry deletion check", "Dobara deletion check karein") : uiText("Check deletion readiness", "Deletion readiness check karein")}</Button>
    {state.status === "error" && <p role="alert" className="text-destructive">{uiText("Could not verify deletion readiness. No readiness result is available. Retry the check.", "Deletion readiness verify nahi hui. Abhi koi readiness result available nahi hai. Dobara check karein.")}</p>}
    {state.status === "done" && state.result && <div role="status" className="space-y-2">
      <p>{state.result.canDelete ? uiText("No linked records found at check time. This is not permission to delete.", "Check ke waqt koi linked record nahi mila. Yeh delete karne ki permission nahi hai.") : uiText("Linked records prevent deletion. Nothing has been deleted or reassigned.", "Linked records ki wajah se deletion blocked hai. Kuch delete ya reassign nahi hua.")}</p>
      {!!state.result.dependencies.length && <ul className="max-h-40 space-y-1 overflow-y-auto break-words">{state.result.dependencies.map(row => <li key={row.group}>{row.group.replaceAll("_", " ")}: {row.count}</li>)}</ul>}
    </div>}
  </section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }

