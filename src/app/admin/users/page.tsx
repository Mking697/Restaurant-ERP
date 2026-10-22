"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MODULE_KEYS, type ModuleKey } from "@/lib/moduleAccess";
import { refreshCurrentUser, requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
interface UserRow { id: string; name: string; phoneE164: string; role: string; branchId: string | null; moduleAccess: ModuleKey[]; status: "Active" | "Inactive"; }
const ROLES = ["SUPER_ADMIN", "CENTRAL_STORE_MGR", "BRANCH_MANAGER", "CASHIER", "KITCHEN_STAFF"];
const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
export default function UsersAdminPage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches, error: branchError } = useBranches();
  const owner = actor.role === "SUPER_ADMIN";
  const allowed = actor.authenticated && (owner || actor.role === "BRANCH_MANAGER");
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const scopeKey = `${actor.id}:${selected}:${actor.moduleAccess.join(",")}`;
  const [loadedScope, setLoadedScope] = React.useState("");
  const url = "/api/users" + (selected !== "all" ? `?branchId=${encodeURIComponent(selected)}` : "");
  React.useEffect(() => {
    setUsers([]); setEditing(null); setPassword(""); setMessage("");
    if (!allowed) return;
    let active = true; setLoading(true); setError("");
    requestJson<{ users: UserRow[] }>(url).then(data => { if (active) { setUsers(data.users); setLoadedScope(scopeKey); } }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, url, scopeKey]);
  function canEdit(user: UserRow) { return owner || (user.id !== actor.id && user.branchId === actor.branchId && ["BRANCH_MANAGER", "CASHIER", "KITCHEN_STAFF"].includes(user.role) && user.moduleAccess.every(key => actor.moduleAccess.includes(key))); }
  function open(user?: UserRow) {
    setError(""); setMessage(""); setPassword("");
    setEditing(user ? { ...user, moduleAccess: [...user.moduleAccess] } : { id: "", name: "", phoneE164: "", role: "KITCHEN_STAFF", branchId: owner ? (selected === "all" ? "" : selected) : actor.branchId, moduleAccess: [], status: "Active" });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editing || !allowed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { id, ...fields } = editing;
      const result = await requestJson<{ user: UserRow }>(id ? `/api/users/${encodeURIComponent(id)}` : "/api/users", { method: id ? "PATCH" : "POST", body: JSON.stringify({ ...fields, ...(password ? { password } : {}) }) });
      await requestJson(`/api/users/${encodeURIComponent(result.user.id)}`);
      setPassword(""); setEditing(null);
      if (result.user.id === actor.id) { await refreshCurrentUser(); return; }
      const data = await requestJson<{ users: UserRow[] }>(url); setUsers(data.users); setLoadedScope(scopeKey);
      setMessage("User saved and reloaded from database.");
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }
  const hq = editing && ["SUPER_ADMIN", "CENTRAL_STORE_MGR"].includes(editing.role);
  const grants = owner ? MODULE_KEYS : MODULE_KEYS.filter(key => actor.moduleAccess.includes(key));
  return <AppShell activeHref="/admin/users">
    <PageHeader title="Users & Access" description="Owner: all branches. Branch Admin: own branch, only grants they hold.">{allowed && <Button size="sm" onClick={() => open()}>New User</Button>}</PageHeader>
    {!allowed ? <p role="alert">User administration requires Owner or Branch Admin access.</p> : <>
      {(error || branchError) && <p role="alert" className="mb-4 text-destructive">{error || branchError}</p>}
      {message && <p role="status" className="mb-4">{message}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0"><CardContent className="pt-5">
          {loading ? <p>Loading users…</p> : <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Role</TableHead><TableHead>Branch</TableHead><TableHead>Grants</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader><TableBody>
            {(loadedScope === scopeKey ? users : []).map(user => <TableRow key={user.id}><TableCell>{user.name}</TableCell><TableCell>{user.phoneE164}</TableCell><TableCell>{user.role.replace(/_/g, " ")}</TableCell><TableCell>{branches.find(branch => branch.id === user.branchId)?.name ?? (user.branchId ? "Own branch" : "HQ")}</TableCell><TableCell>{user.moduleAccess.length}</TableCell><TableCell>{user.status}</TableCell><TableCell><Button size="sm" variant="ghost" disabled={!canEdit(user) || busy} onClick={() => open(user)}>Edit</Button></TableCell></TableRow>)}
          </TableBody></Table>}
          {!loading && !error && !users.length && <p>No users in this scope.</p>}
        </CardContent></Card>
        {editing && <Card><CardHeader><CardTitle>{editing.id ? "Edit User" : "New User"}</CardTitle><CardDescription>Saved changes revoke this user’s existing sessions. Password is never stored in browser storage.</CardDescription></CardHeader><CardContent>
          <form onSubmit={save} className="space-y-3"><fieldset disabled={busy} className="space-y-3">
            <Field label="Name"><input required className={inputClass} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></Field>
            <Field label="Phone (with country code)"><input required type="tel" className={inputClass} value={editing.phoneE164} onChange={event => setEditing({ ...editing, phoneE164: event.target.value })} /></Field>
            <Field label={editing.id ? "New password (blank keeps existing)" : "Password (at least 12 characters)"}><input type="password" autoComplete="new-password" required={!editing.id} minLength={12} className={inputClass} value={password} onChange={event => setPassword(event.target.value)} /></Field>
            <Field label="Role"><select className={inputClass} value={editing.role} onChange={event => { const role = event.target.value; setEditing({ ...editing, role, branchId: ["SUPER_ADMIN", "CENTRAL_STORE_MGR"].includes(role) ? null : owner ? "" : actor.branchId }); }}>{ROLES.filter(role => owner || !["SUPER_ADMIN", "CENTRAL_STORE_MGR"].includes(role)).map(role => <option key={role}>{role}</option>)}</select></Field>
            <Field label="Branch"><select className={inputClass} required={!hq} disabled={!!hq || !owner} value={editing.branchId ?? ""} onChange={event => setEditing({ ...editing, branchId: event.target.value })}><option value="">{hq ? "HQ — no branch" : "Select branch"}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></Field>
            <Field label="Module grants"><div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-2">{grants.map(key => <label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editing.moduleAccess.includes(key)} onChange={event => setEditing({ ...editing, moduleAccess: event.target.checked ? [...editing.moduleAccess, key] : editing.moduleAccess.filter(grant => grant !== key) })} />{key.replace(/_/g, " ")}</label>)}</div></Field>
            <Field label="Status"><select className={inputClass} value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value as UserRow["status"] })}><option>Active</option><option>Inactive</option></select></Field>
            <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button><Button type="button" variant="outline" onClick={() => { setEditing(null); setPassword(""); }}>Cancel</Button></div>
          </fieldset></form>
        </CardContent></Card>}
      </div>
    </>}
  </AppShell>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span>{children}</label>; }

