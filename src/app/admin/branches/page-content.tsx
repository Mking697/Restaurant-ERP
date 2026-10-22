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
  const allowed = actor.authenticated && (owner || actor.role === "BRANCH_MANAGER");
  const [editing, setEditing] = React.useState<BranchRecord | null>(null);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setEditing(null); setMessage(""); }, [actor.id, actor.role, actor.branchId]);
  function create() { setError(""); setMessage(""); setEditing({ id: "", code: "", name: "", address: "", lat: "0", lng: "0", geofenceRadiusM: 50 }); }
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
    <PageHeader title={uiText("Branches")} description={uiText("Owner creates branches; Branch Admin maintains own branch details. Cloning is not implemented — menus, BOM and checklists are not copied.")}>
      <Button variant="outline" size="sm" disabled>{uiText("Clone unavailable")}</Button>{allowed && owner && <Button size="sm" onClick={create}>{uiText("New Branch")}</Button>}
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
        <div className="flex gap-2"><Button type="submit">{busy ? uiText("Saving…") : uiText("Save")}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>{uiText("Cancel")}</Button></div>
      </fieldset></form>}
    </DialogContent></Dialog>
  </AppShell>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }

