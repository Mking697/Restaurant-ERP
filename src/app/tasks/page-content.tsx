"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { useTranslation } from "@/lib/i18n";
import { Plus, Repeat, UserCheck, Paperclip, CheckCircle2 } from "lucide-react";
import {
  ActionState, DataTable, Field, inputClass, LoadState, Panel, post, query, useAction, useResource,
} from "../workforce/live-ui";

const FREQUENCIES = [
  { code: "DAILY", label: "Daily" },
  { code: "WEEKLY", label: "Weekly" },
  { code: "FORTNIGHTLY", label: "Fortnightly (15 days)" },
  { code: "MONTHLY", label: "Monthly" },
  { code: "QUARTERLY", label: "Quarterly" },
  { code: "HALF_YEARLY", label: "Half-Yearly" },
  { code: "YEARLY", label: "Yearly" },
] as const;
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

interface RecurringRow {
  id: string; branchId: string; branchName: string; title: string; description: string;
  assignedToId: string; assignedToName: string; frequency: string; assignDate: string; shiftTime: string;
  attachmentHint: boolean; requiresGeofence: boolean; status: "Active" | "Paused";
}
interface InstanceRow {
  id: string; branchId: string; branchName: string; type: "RECURRING" | "ONE_TIME"; title: string; description: string;
  assignedToId: string; assignedToName: string; priority: "HIGH" | "MEDIUM" | "LOW" | null; dueAt: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "OVERDUE" | "ESCALATED" | "SKIPPED"; completedAt: string | null; attachmentUrl: string;
}

interface AssigneeRow { id: string; name: string }
function useTaskAssignees(open: boolean, canManage: boolean, branchId: string) {
  const enabled = open && canManage && !!branchId;
  const resource = useResource<{ branchId: string; assignees: AssigneeRow[] }>(enabled ? `/api/tasks/assignees?${query(branchId)}` : null);
  const ready = enabled && !resource.loading && !resource.error && resource.data?.branchId === branchId;
  const options = ready ? resource.data!.assignees : [];
  return { ...resource, ready, options, valid: (id: string) => ready && options.some(row => row.id === id) };
}
function AssigneeField({ label, branchId, lookup, value, onChange }: {
  label: string; branchId: string; lookup: ReturnType<typeof useTaskAssignees>; value: string; onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return <div><Field label={label}>
    <select className={inputClass} required disabled={!lookup.ready || !lookup.options.length} value={lookup.valid(value) ? value : ""} onChange={e => onChange(e.target.value)}>
      <option value="">{t("Select doer", "Doer chuno")}</option>
      {lookup.options.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select>
  </Field>
    {!branchId ? <p className="text-xs text-muted-foreground">{t("Select a branch to load doers.", "Doers load karne ke liye branch chuno.")}</p> : <LoadState {...lookup} empty={lookup.ready && !lookup.options.length} />}
  </div>;
}

export default function TasksPage() {
  const actor = useCurrentUser(); const selected = useSelectedBranchId();
  const identity = `${actor.id}:${actor.authenticated}:${actor.role}:${actor.branchId}:${actor.moduleAccess.join(",")}:${selected}`;
  return <AppShell activeHref="/tasks"><TasksScope key={identity} selected={selected} /></AppShell>;
}

function TasksScope({ selected }: { selected: string }) {
  const { t } = useTranslation(); const actor = useCurrentUser(); const { branches, error } = useBranches();
  const canRecurring = hasCurrentModule(actor, "TASKS_RECURRING");
  const canDelegate = hasCurrentModule(actor, "TASKS_DELEGATION");
  const scopedBranchId = actor.role === "SUPER_ADMIN" ? (selected === "all" ? "" : selected) : (actor.branchId ?? "");
  const branchId = scopedBranchId && scopedBranchId !== "__no_branch__" ? scopedBranchId : "";
  return <>
    <PageHeader title={t("Tasks & Checklists", "Tasks & Checklists")}
      description={t("Checklist is a recurring task — assign once, new occurrences follow the frequency. Delegation is one-time and priority-based; the doer marks it Done from their own dashboard.",
        "Checklist hi recurring task hai — ek baar assign karo, frequency ke hisaab se naye occurrence bante hain. Delegation one-time, priority-based hai. Doer apne dashboard se Done karega.")} />
    {error && <p role="alert" className="mb-3 text-destructive">{error}</p>}
    <Tabs defaultValue={canRecurring ? "recurring" : "delegation"}>
      <TabsList>
        <TabsTrigger value="recurring">{t("Recurring / Checklist", "Recurring / Checklist")}</TabsTrigger>
        <TabsTrigger value="delegation">{t("Delegation — One-Time", "Delegation — One-Time")}</TabsTrigger>
      </TabsList>
      <TabsContent value="recurring"><RecurringPanel branchId={branchId} canManage={canRecurring} branches={branches} /></TabsContent>
      <TabsContent value="delegation"><DelegationPanel branchId={branchId} canManage={canDelegate} branches={branches} /></TabsContent>
    </Tabs>
  </>;
}

function RecurringPanel({ branchId, canManage, branches }: { branchId: string; canManage: boolean; branches: { id: string; code: string; name: string }[] }) {
  const { t } = useTranslation();
  const resource = useResource<{ recurring: RecurringRow[] }>(canManage ? `/api/tasks/recurring${branchId ? `?${query(branchId)}` : ""}` : null);
  const action = useAction();
  const [open, setOpen] = React.useState(false);
  const blank = () => ({ branchId, title: "", description: "", assignedToId: "", frequency: "DAILY" as (typeof FREQUENCIES)[number]["code"], assignDate: "", shiftTime: "09:00", attachmentHint: true, requiresGeofence: true });
  const [entry, setEntry] = React.useState(blank);
  const assignees = useTaskAssignees(open, canManage, entry.branchId);
  if (!canManage) return <Panel><p role="alert">{t("TASKS_RECURRING grant is required to manage recurring checklists. You can still see your own assigned delegated tasks in the other tab.", "Recurring checklist manage karne ke liye TASKS_RECURRING grant chahiye. Doosre tab mein apne assigned delegated tasks dekh sakte ho.")}</p></Panel>;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignees.valid(entry.assignedToId)) return;
    if (await action.run(async () => {
      await post("/api/tasks/recurring", { ...entry, description: entry.description || undefined, assignDate: new Date(entry.assignDate).toISOString() });
      await resource.reload();
    }, t("Recurring checklist saved.", "Recurring checklist save hui."))) { setEntry(blank()); setOpen(false); }
  }
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold">{t("Recurring task / checklist definitions", "Recurring task / checklist definitions")}</h2>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setEntry(blank()); }}>
        <DialogTrigger asChild><Button variant="outline" size="sm"><Repeat /> {t("New Recurring / Checklist", "Naya Recurring / Checklist")}</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("New Recurring Task / Checklist", "Naya Recurring Task / Checklist")}</DialogTitle>
            <DialogDescription>{t("Attachment is optional for the doer. Automatic occurrence generation from this rule is not part of this pass.", "Attachment doer ke liye optional hai. Is rule se automatic occurrence banna is pass mein shamil nahi hai.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}><fieldset disabled={action.busy} className="space-y-3">
            {!branchId && <Field label={t("Branch", "Branch")}><select className={inputClass} required value={entry.branchId} onChange={(e) => setEntry({ ...entry, branchId: e.target.value, assignedToId: "" })}><option value="">{t("Select branch", "Branch chuno")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field>}
            <Field label={t("Task / checklist title", "Task / checklist title")}><input className={inputClass} required maxLength={200} value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} placeholder={t("Walk-in fridge temp log", "Walk-in fridge temp log")} /></Field>
            <Field label={t("Description (optional)", "Description (optional)")}><input className={inputClass} maxLength={2000} value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} /></Field>
            <AssigneeField label={t("Assigned to (Doer)", "Assigned to (Doer)")} branchId={entry.branchId} lookup={assignees} value={entry.assignedToId} onChange={assignedToId => setEntry({ ...entry, assignedToId })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Frequency", "Frequency")}><select className={inputClass} value={entry.frequency} onChange={(e) => setEntry({ ...entry, frequency: e.target.value as typeof entry.frequency })}>{FREQUENCIES.map((f) => <option key={f.code} value={f.code}>{t(f.label)}</option>)}</select></Field>
              <Field label={t("Shift time", "Shift time")}><input type="time" className={inputClass} value={entry.shiftTime} onChange={(e) => setEntry({ ...entry, shiftTime: e.target.value })} /></Field>
            </div>
            <Field label={t("Anchor assign date", "Anchor assign date")}><input type="date" className={inputClass} required value={entry.assignDate} onChange={(e) => setEntry({ ...entry, assignDate: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entry.attachmentHint} onChange={(e) => setEntry({ ...entry, attachmentHint: e.target.checked })} /> {t("Nudge doer to attach evidence (still optional)", "Doer ko evidence attach karne ka nudge (phir bhi optional)")}</label>
          </fieldset><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("Cancel", "Cancel")}</Button><Button type="submit" disabled={action.busy || !assignees.valid(entry.assignedToId)}>{action.busy ? t("Saving…", "Save ho raha hai…") : t("Create", "Create karo")}</Button></DialogFooter></form>
          <ActionState action={action} />
        </DialogContent>
      </Dialog>
    </div>
    <LoadState {...resource} empty={!resource.data?.recurring.length} />
    {resource.data && <DataTable headers={[t("Task", "Task"), t("Branch", "Branch"), t("Doer", "Doer"), t("Frequency", "Frequency"), t("Shift time", "Shift time"), t("Status", "Status"), ""]}>
      {resource.data.recurring.map((r) => <tr key={r.id}>
        <td className="font-medium">{r.title}</td><td>{r.branchName}</td>
        <td><span className="inline-flex items-center gap-1"><UserCheck className="size-3.5 text-muted-foreground" /> {r.assignedToName}</span></td>
        <td>{t(FREQUENCIES.find((f) => f.code === r.frequency)?.label ?? r.frequency)}</td><td>{r.shiftTime}</td>
        <td>{r.status}</td>
        <td><Button variant="outline" size="sm" disabled={action.busy} onClick={() => void action.run(async () => { await post(`/api/tasks/recurring/${encodeURIComponent(r.id)}`, { status: r.status === "Active" ? "Paused" : "Active" }, "PATCH"); await resource.reload(); }, t("Status updated.", "Status update hua."))}>{r.status === "Active" ? t("Pause", "Pause karo") : t("Resume", "Resume karo")}</Button></td>
      </tr>)}
    </DataTable>}
  </div>;
}

function captureLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null), // permission denied / unavailable -> fail open, never blocks completion
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}
async function uploadTaskEvidence(instanceId: string, photo: File, coords: { lat: number; lng: number } | null) {
  const form = new FormData();
  form.append("photo", photo);
  if (coords) { form.append("lat", String(coords.lat)); form.append("lng", String(coords.lng)); }
  const res = await fetch(`/api/tasks/instances/${encodeURIComponent(instanceId)}/evidence`, {
    method: "POST", credentials: "same-origin", body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Evidence upload failed (${res.status})`);
  return data as { proof: { withinGeofence: boolean | null; distanceFromBranchM: string | null } };
}

function ViewEvidenceButton({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  async function view() {
    setBusy(true); setError("");
    try {
      const data = await requestJson<{ url: string }>(`/api/tasks/instances/${encodeURIComponent(instanceId)}/evidence`);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load evidence"); }
    finally { setBusy(false); }
  }
  return <span className="inline-flex items-center gap-1">
    <Button variant="outline" size="sm" disabled={busy} onClick={view}><Paperclip className="size-3.5" /> {busy ? t("Loading…", "Load ho raha hai…") : t("View evidence", "Evidence dekho")}</Button>
    {error && <span className="text-xs text-destructive">{error}</span>}
  </span>;
}

function DelegationPanel({ branchId, canManage, branches }: { branchId: string; canManage: boolean; branches: { id: string; code: string; name: string }[] }) {
  const { t } = useTranslation();
  const resource = useResource<{ instances: InstanceRow[] }>(`/api/tasks/instances?${new URLSearchParams({ type: "ONE_TIME", ...(branchId ? { branchId } : {}) }).toString()}`);
  const action = useAction();
  const [open, setOpen] = React.useState(false);
  const blank = () => ({ branchId, title: "", description: "", assignedToId: "", priority: "MEDIUM" as (typeof PRIORITIES)[number], dueAt: "" });
  const [entry, setEntry] = React.useState(blank);
  const assignees = useTaskAssignees(open, canManage, entry.branchId);
  const [doneTask, setDoneTask] = React.useState<InstanceRow | null>(null);
  const [donePhoto, setDonePhoto] = React.useState<File | null>(null);
  const [geoStatus, setGeoStatus] = React.useState<"idle" | "capturing" | "captured" | "unavailable">("idle");
  const [geoCoords, setGeoCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  async function onPhotoSelected(file: File | null) {
    setDonePhoto(file);
    if (!file) return;
    setGeoStatus("capturing");
    const coords = await captureLocation();
    setGeoCoords(coords);
    setGeoStatus(coords ? "captured" : "unavailable");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignees.valid(entry.assignedToId)) return;
    if (await action.run(async () => {
      await post("/api/tasks/delegate", { ...entry, description: entry.description || undefined, dueAt: new Date(entry.dueAt).toISOString() });
      await resource.reload();
    }, t("Task delegated.", "Task delegate hua."))) { setEntry(blank()); setOpen(false); }
  }
  async function submitMarkDone() {
    if (!doneTask) return;
    if (await action.run(async () => {
      if (donePhoto) await uploadTaskEvidence(doneTask.id, donePhoto, geoCoords);
      await post(`/api/tasks/instances/${encodeURIComponent(doneTask.id)}/complete`, {});
      await resource.reload();
    }, t("Marked Done.", "Done mark hua."))) { setDoneTask(null); setDonePhoto(null); setGeoStatus("idle"); setGeoCoords(null); }
  }
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold">{t("One-time delegated tasks", "One-time delegated tasks")}</h2>
      {canManage && <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setEntry(blank()); }}>
        <DialogTrigger asChild><Button size="sm"><Plus /> {t("Delegate Task", "Task Delegate Karo")}</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Delegate Task (One-Time)", "Task Delegate Karo (One-Time)")}</DialogTitle>
            <DialogDescription>{t("The doer will be REQUIRED to attach evidence before marking this Done.", "Doer ko ise Done marking se pehle evidence attach karna ZAROORI hoga.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}><fieldset disabled={action.busy} className="space-y-3">
            {!branchId && <Field label={t("Branch", "Branch")}><select className={inputClass} required value={entry.branchId} onChange={(e) => setEntry({ ...entry, branchId: e.target.value, assignedToId: "" })}><option value="">{t("Select branch", "Branch chuno")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field>}
            <Field label={t("Task title", "Task title")}><input className={inputClass} required maxLength={200} value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} placeholder={t("Repair exhaust fan", "Repair exhaust fan")} /></Field>
            <Field label={t("Description (optional)", "Description (optional)")}><input className={inputClass} maxLength={2000} value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} /></Field>
            <AssigneeField label={t("Assign to", "Assign to")} branchId={entry.branchId} lookup={assignees} value={entry.assignedToId} onChange={assignedToId => setEntry({ ...entry, assignedToId })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Priority", "Priority")}><select className={inputClass} value={entry.priority} onChange={(e) => setEntry({ ...entry, priority: e.target.value as typeof entry.priority })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
              <Field label={t("Due", "Due")}><input type="datetime-local" className={inputClass} required value={entry.dueAt} onChange={(e) => setEntry({ ...entry, dueAt: e.target.value })} /></Field>
            </div>
          </fieldset><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("Cancel", "Cancel")}</Button><Button type="submit" disabled={action.busy || !assignees.valid(entry.assignedToId)}>{action.busy ? t("Delegating…", "Delegate ho raha hai…") : t("Delegate", "Delegate karo")}</Button></DialogFooter></form>
          <ActionState action={action} />
        </DialogContent>
      </Dialog>}
    </div>
    <LoadState {...resource} empty={!resource.data?.instances.length} />
    {resource.data && <DataTable headers={[t("Task", "Task"), t("Branch", "Branch"), t("Doer", "Doer"), t("Priority", "Priority"), t("Due", "Due"), t("Evidence", "Evidence"), t("Status", "Status"), ""]}>
      {resource.data.instances.map((i) => <tr key={i.id}>
        <td className="font-medium">{i.title}</td><td>{i.branchName}</td>
        <td><span className="inline-flex items-center gap-1"><UserCheck className="size-3.5 text-muted-foreground" /> {i.assignedToName}</span></td>
        <td>{i.priority}</td><td className="whitespace-nowrap text-sm text-muted-foreground">{new Date(i.dueAt).toLocaleString()}</td>
        <td>{!i.attachmentUrl ? <span className="text-xs text-muted-foreground">—</span>
          : i.attachmentUrl.startsWith("evidence/") || /^https:\/\/[^/]+\.private\.blob\.vercel-storage\.com\//i.test(i.attachmentUrl)
            ? <ViewEvidenceButton instanceId={i.id} />
            // Older completions stored arbitrary text/URL references, not task_proofs.
            // Keep them visible as inert text; never send them to the upload-only reader.
            : <span className="break-all text-xs text-muted-foreground">{i.attachmentUrl}</span>}</td>
        <td>{i.status.replace(/_/g, " ")}</td>
        <td>{i.status !== "DONE" && <Button variant="outline" size="sm" onClick={() => { setDoneTask(i); setDonePhoto(null); setGeoStatus("idle"); setGeoCoords(null); }}>{t("Mark Done", "Done karo")}</Button>}</td>
      </tr>)}
    </DataTable>}
    <Dialog open={!!doneTask} onOpenChange={(open) => !open && setDoneTask(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("Mark Done — ", "Done karo — ")}{doneTask?.title}</DialogTitle>
          <DialogDescription>{t("A real camera photo is REQUIRED — a delegated one-time task cannot be Done without it. Your location is captured best-effort for a geofence check; denying location access never blocks completion.", "Asli camera photo ZAROORI hai — delegation task bina photo Done nahi ho sakta. Location best-effort capture hota hai geofence check ke liye; location deny karne se completion block nahi hoga.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("Evidence photo (required)", "Evidence photo (zaroori)")}>
            <input type="file" accept="image/*" capture="environment" className={inputClass}
              onChange={(e) => void onPhotoSelected(e.target.files?.[0] ?? null)} />
          </Field>
          {donePhoto && <p className="text-xs text-muted-foreground">{t("Selected", "Chuna gaya")}: {donePhoto.name} ({Math.round(donePhoto.size / 1024)} KB)</p>}
          {geoStatus === "capturing" && <p className="text-xs text-muted-foreground">{t("Capturing location…", "Location capture ho raha hai…")}</p>}
          {geoStatus === "captured" && <p className="text-xs text-success">{t("Location captured for geofence check.", "Geofence check ke liye location capture hui.")}</p>}
          {geoStatus === "unavailable" && <p className="text-xs text-muted-foreground">{t("Location unavailable or denied — completion will still proceed; geofence status will be recorded as not available.", "Location unavailable ya deny hui — completion phir bhi hoga; geofence status \"not available\" record hoga.")}</p>}
          {!donePhoto && <p className="text-xs text-destructive">{t("A photo is required before marking this delegation task Done.", "Is delegation task ko Done marking se pehle photo zaroori hai.")}</p>}
        </div>
        <ActionState action={action} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setDoneTask(null)}>{t("Cancel", "Cancel")}</Button>
          <Button onClick={submitMarkDone} disabled={action.busy || !donePhoto}><CheckCircle2 /> {t("Mark Done", "Done karo")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
