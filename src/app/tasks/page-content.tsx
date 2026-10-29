"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasCurrentModule, useCurrentUser } from "@/lib/current-user";
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
  if (!canManage) return <Panel><p role="alert">{t("TASKS_RECURRING grant is required to manage recurring checklists. You can still see your own assigned delegated tasks in the other tab.", "Recurring checklist manage karne ke liye TASKS_RECURRING grant chahiye. Doosre tab mein apne assigned delegated tasks dekh sakte ho.")}</p></Panel>;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
            {!branchId && <Field label={t("Branch", "Branch")}><select className={inputClass} required value={entry.branchId} onChange={(e) => setEntry({ ...entry, branchId: e.target.value })}><option value="">{t("Select branch", "Branch chuno")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field>}
            <Field label={t("Task / checklist title", "Task / checklist title")}><input className={inputClass} required maxLength={200} value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} placeholder={t("Walk-in fridge temp log", "Walk-in fridge temp log")} /></Field>
            <Field label={t("Description (optional)", "Description (optional)")}><input className={inputClass} maxLength={2000} value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} /></Field>
            <Field label={t("Assigned to (Doer) — user ID", "Assigned to (Doer) — user ID")}><input className={inputClass} required value={entry.assignedToId} onChange={(e) => setEntry({ ...entry, assignedToId: e.target.value })} placeholder={t("Exact user id of a user in this branch", "Is branch ke user ka exact id")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Frequency", "Frequency")}><select className={inputClass} value={entry.frequency} onChange={(e) => setEntry({ ...entry, frequency: e.target.value as typeof entry.frequency })}>{FREQUENCIES.map((f) => <option key={f.code} value={f.code}>{t(f.label)}</option>)}</select></Field>
              <Field label={t("Shift time", "Shift time")}><input type="time" className={inputClass} value={entry.shiftTime} onChange={(e) => setEntry({ ...entry, shiftTime: e.target.value })} /></Field>
            </div>
            <Field label={t("Anchor assign date", "Anchor assign date")}><input type="date" className={inputClass} required value={entry.assignDate} onChange={(e) => setEntry({ ...entry, assignDate: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entry.attachmentHint} onChange={(e) => setEntry({ ...entry, attachmentHint: e.target.checked })} /> {t("Nudge doer to attach evidence (still optional)", "Doer ko evidence attach karne ka nudge (phir bhi optional)")}</label>
          </fieldset><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("Cancel", "Cancel")}</Button><Button type="submit" disabled={action.busy}>{action.busy ? t("Saving…", "Save ho raha hai…") : t("Create", "Create karo")}</Button></DialogFooter></form>
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

function DelegationPanel({ branchId, canManage, branches }: { branchId: string; canManage: boolean; branches: { id: string; code: string; name: string }[] }) {
  const { t } = useTranslation();
  const resource = useResource<{ instances: InstanceRow[] }>(`/api/tasks/instances?${new URLSearchParams({ type: "ONE_TIME", ...(branchId ? { branchId } : {}) }).toString()}`);
  const action = useAction();
  const [open, setOpen] = React.useState(false);
  const blank = () => ({ branchId, title: "", description: "", assignedToId: "", priority: "MEDIUM" as (typeof PRIORITIES)[number], dueAt: "" });
  const [entry, setEntry] = React.useState(blank);
  const [doneTask, setDoneTask] = React.useState<InstanceRow | null>(null);
  const [doneAttachment, setDoneAttachment] = React.useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await action.run(async () => {
      await post("/api/tasks/delegate", { ...entry, description: entry.description || undefined, dueAt: new Date(entry.dueAt).toISOString() });
      await resource.reload();
    }, t("Task delegated.", "Task delegate hua."))) { setEntry(blank()); setOpen(false); }
  }
  async function submitMarkDone() {
    if (!doneTask) return;
    if (await action.run(async () => {
      await post(`/api/tasks/instances/${encodeURIComponent(doneTask.id)}/complete`, { attachmentUrl: doneAttachment || undefined });
      await resource.reload();
    }, t("Marked Done.", "Done mark hua."))) { setDoneTask(null); setDoneAttachment(""); }
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
            {!branchId && <Field label={t("Branch", "Branch")}><select className={inputClass} required value={entry.branchId} onChange={(e) => setEntry({ ...entry, branchId: e.target.value })}><option value="">{t("Select branch", "Branch chuno")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field>}
            <Field label={t("Task title", "Task title")}><input className={inputClass} required maxLength={200} value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} placeholder={t("Repair exhaust fan", "Repair exhaust fan")} /></Field>
            <Field label={t("Description (optional)", "Description (optional)")}><input className={inputClass} maxLength={2000} value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} /></Field>
            <Field label={t("Assign to — user ID", "Assign to — user ID")}><input className={inputClass} required value={entry.assignedToId} onChange={(e) => setEntry({ ...entry, assignedToId: e.target.value })} placeholder={t("Exact user id of a user in this branch", "Is branch ke user ka exact id")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Priority", "Priority")}><select className={inputClass} value={entry.priority} onChange={(e) => setEntry({ ...entry, priority: e.target.value as typeof entry.priority })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
              <Field label={t("Due", "Due")}><input type="datetime-local" className={inputClass} required value={entry.dueAt} onChange={(e) => setEntry({ ...entry, dueAt: e.target.value })} /></Field>
            </div>
          </fieldset><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("Cancel", "Cancel")}</Button><Button type="submit" disabled={action.busy}>{action.busy ? t("Delegating…", "Delegate ho raha hai…") : t("Delegate", "Delegate karo")}</Button></DialogFooter></form>
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
        <td>{i.attachmentUrl ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-3" /> {i.attachmentUrl}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
        <td>{i.status.replace(/_/g, " ")}</td>
        <td>{i.status !== "DONE" && <Button variant="outline" size="sm" onClick={() => { setDoneTask(i); setDoneAttachment(""); }}>{t("Mark Done", "Done karo")}</Button>}</td>
      </tr>)}
    </DataTable>}
    <Dialog open={!!doneTask} onOpenChange={(open) => !open && setDoneTask(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("Mark Done — ", "Done karo — ")}{doneTask?.title}</DialogTitle>
          <DialogDescription>{t("Evidence attachment REQUIRED — a delegated one-time task cannot be Done without it. No file upload pipeline in this pass; enter a reference link or filename.", "Evidence attachment ZAROORI hai — delegation task bina attachment Done nahi ho sakta. Is pass mein file upload nahi; reference link ya filename daalo.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("Evidence attachment (required)", "Evidence attachment (zaroori)")}><input className={inputClass} value={doneAttachment} onChange={(e) => setDoneAttachment(e.target.value)} placeholder={t("e.g. https://… or receipt.jpg", "jaise https://… ya receipt.jpg")} /></Field>
          {!doneAttachment.trim() && <p className="text-xs text-destructive">{t("Attachment is required before marking this delegation task Done.", "Is delegation task ko Done marking se pehle attachment zaroori hai.")}</p>}
        </div>
        <ActionState action={action} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setDoneTask(null)}>{t("Cancel", "Cancel")}</Button>
          <Button onClick={submitMarkDone} disabled={action.busy || !doneAttachment.trim()}><CheckCircle2 /> {t("Mark Done", "Done karo")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
