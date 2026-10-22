"use client";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { getTasks, filterByBranch, FREQUENCIES, PRIORITIES, type TaskRow } from "@/lib/mock-data";
import { useSelectedBranchId } from "@/lib/current-branch";
import { Plus, Repeat, UserCheck, Paperclip, CheckCircle2 } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  PENDING: "secondary",
  IN_PROGRESS: "warning",
  DONE: "success",
  OVERDUE: "destructive",
  ESCALATED: "destructive",
  SKIPPED: "outline",
};

const PRIORITY_VARIANT: Record<string, "destructive" | "warning" | "secondary"> = {
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

function FrequencyLabel({ code }: { code?: string }) {
  const f = FREQUENCIES.find((x) => x.code === code);
  return <Badge variant="outline">{f?.label ?? code ?? "—"}</Badge>;
}

export default function TasksPage() {
  const selectedBranchId = useSelectedBranchId();
  const [tasks, setTasks] = React.useState<TaskRow[]>(getTasks());
  const [recurringOpen, setRecurringOpen] = React.useState(false);
  const [delegateOpen, setDelegateOpen] = React.useState(false);
  const [doneTask, setDoneTask] = React.useState<TaskRow | null>(null);
  const [doneAttachment, setDoneAttachment] = React.useState("");
  const { notify, ToastHost } = useToast();

  const [recurring, setRecurring] = React.useState({
    title: "",
    branch: "",
    assignedTo: "",
    frequency: "DAILY" as (typeof FREQUENCIES)[number]["code"],
    shiftTime: "09:00",
  });
  const [delegate, setDelegate] = React.useState({
    title: "",
    branch: "",
    assignedTo: "",
    priority: "MEDIUM" as (typeof PRIORITIES)[number],
    dueAt: "",
  });

  function addRecurring() {
    if (!recurring.title.trim() || !recurring.branch.trim() || !recurring.assignedTo.trim()) return;
    const freqLabel = FREQUENCIES.find((f) => f.code === recurring.frequency)?.label;
    setTasks((prev) => [
      {
        id: `t${prev.length + 1}-${Date.now()}`,
        title: recurring.title.trim(),
        branch: recurring.branch.trim(),
        assignedTo: recurring.assignedTo.trim(),
        type: "RECURRING",
        status: "PENDING",
        dueAt: `${recurring.shiftTime} (${freqLabel})`,
        frequency: recurring.frequency,
      },
      ...prev,
    ]);
    notify(`Recurring task "${recurring.title}" created — auto-assigns ${freqLabel?.toLowerCase()}`);
    setRecurring({ title: "", branch: "", assignedTo: "", frequency: "DAILY", shiftTime: "09:00" });
    setRecurringOpen(false);
  }

  function addDelegate() {
    if (!delegate.title.trim() || !delegate.branch.trim() || !delegate.assignedTo.trim()) return;
    setTasks((prev) => [
      {
        id: `t${prev.length + 1}-${Date.now()}`,
        title: delegate.title.trim(),
        branch: delegate.branch.trim(),
        assignedTo: delegate.assignedTo.trim(),
        type: "ONE_TIME",
        status: "PENDING",
        dueAt: delegate.dueAt.trim() || "No deadline set",
        priority: delegate.priority,
      },
      ...prev,
    ]);
    notify(`Task delegated to ${delegate.assignedTo} — ${delegate.priority} priority`);
    setDelegate({ title: "", branch: "", assignedTo: "", priority: "MEDIUM", dueAt: "" });
    setDelegateOpen(false);
  }

  function openMarkDone(task: TaskRow) {
    setDoneTask(task);
    setDoneAttachment("");
  }

  function submitMarkDone() {
    if (!doneTask) return;
    const attachmentRequired = doneTask.type === "ONE_TIME";
    if (attachmentRequired && !doneAttachment.trim()) return; // blocked — required for delegation
    setTasks((prev) =>
      prev.map((t) =>
        t.id === doneTask.id ? { ...t, status: "DONE", attachmentName: doneAttachment.trim() || t.attachmentName } : t
      )
    );
    notify(`"${doneTask.title}" marked Done${doneAttachment.trim() ? " with evidence attached" : ""}`);
    setDoneTask(null);
  }

  const recurringTasks = filterByBranch(tasks, selectedBranchId).filter((t) => t.type === "RECURRING");
  const delegationTasks = filterByBranch(tasks, selectedBranchId).filter((t) => t.type === "ONE_TIME");

  return (
    <AppShell activeHref="/tasks">
      <PageHeader
        title="Tasks & Checklists"
        description="Checklist hi recurring task hai — ek baar assign karo, frequency ke hisaab se auto-assign hota rahega. Delegation one-time, priority-based hai. Doer apne dashboard se Done karega."
      >
        <Dialog open={recurringOpen} onOpenChange={setRecurringOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Repeat /> New Recurring / Checklist
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Recurring Task / Checklist</DialogTitle>
              <DialogDescription>
                Ek baar assign karne ke baad frequency ke hisaab se automatic naye occurrence ban te rahenge. Attachment doer
                ke liye optional hai.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Task / checklist title">
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={recurring.title}
                  onChange={(e) => setRecurring({ ...recurring, title: e.target.value })}
                  placeholder="Walk-in fridge temp log"
                />
              </Field>
              <Field label="Branch">
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={recurring.branch}
                  onChange={(e) => setRecurring({ ...recurring, branch: e.target.value })}
                  placeholder="Connaught Place"
                />
              </Field>
              <Field label="Assigned to (Doer)">
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={recurring.assignedTo}
                  onChange={(e) => setRecurring({ ...recurring, assignedTo: e.target.value })}
                  placeholder="Priya Nair"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Frequency">
                  <select
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={recurring.frequency}
                    onChange={(e) => setRecurring({ ...recurring, frequency: e.target.value as typeof recurring.frequency })}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.code} value={f.code}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Shift time">
                  <input
                    type="time"
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={recurring.shiftTime}
                    onChange={(e) => setRecurring({ ...recurring, shiftTime: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecurringOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={addRecurring}
                disabled={!recurring.title.trim() || !recurring.branch.trim() || !recurring.assignedTo.trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={delegateOpen} onOpenChange={setDelegateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> Delegate Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delegate Task (One-Time)</DialogTitle>
              <DialogDescription>
                Priority-based one-time task. Doer ko Done karte waqt evidence attachment REQUIRED hoga.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Task title">
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={delegate.title}
                  onChange={(e) => setDelegate({ ...delegate, title: e.target.value })}
                  placeholder="Repair exhaust fan"
                />
              </Field>
              <Field label="Branch">
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={delegate.branch}
                  onChange={(e) => setDelegate({ ...delegate, branch: e.target.value })}
                  placeholder="Noida"
                />
              </Field>
              <Field label="Assign to">
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={delegate.assignedTo}
                  onChange={(e) => setDelegate({ ...delegate, assignedTo: e.target.value })}
                  placeholder="Maintenance vendor"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Priority">
                  <select
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={delegate.priority}
                    onChange={(e) => setDelegate({ ...delegate, priority: e.target.value as typeof delegate.priority })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Due">
                  <input
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={delegate.dueAt}
                    onChange={(e) => setDelegate({ ...delegate, dueAt: e.target.value })}
                    placeholder="Today 18:00"
                  />
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDelegateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={addDelegate}
                disabled={!delegate.title.trim() || !delegate.branch.trim() || !delegate.assignedTo.trim()}
              >
                Delegate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Tabs defaultValue="recurring">
        <TabsList>
          <TabsTrigger value="recurring">Recurring / Checklist ({recurringTasks.length})</TabsTrigger>
          <TabsTrigger value="delegation">Delegation — One-Time ({delegationTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="recurring">
          <TaskTable rows={recurringTasks} onMarkDone={openMarkDone} kind="recurring" />
        </TabsContent>
        <TabsContent value="delegation">
          <TaskTable rows={delegationTasks} onMarkDone={openMarkDone} kind="delegation" />
        </TabsContent>
      </Tabs>

      {/* Mark Done — attachment required for Delegation, optional for Recurring/Checklist */}
      <Dialog open={!!doneTask} onOpenChange={(open) => !open && setDoneTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Done — {doneTask?.title}</DialogTitle>
            <DialogDescription>
              {doneTask?.type === "ONE_TIME"
                ? "Evidence attachment REQUIRED — delegation task bina attachment ke Done nahi ho sakta."
                : "Evidence attachment optional hai is recurring/checklist task ke liye."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field
              label={`Evidence attachment${doneTask?.type === "ONE_TIME" ? " (required)" : " (optional)"}`}
            >
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-card px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent">
                <Paperclip className="size-4 shrink-0" />
                <span className="truncate">{doneAttachment || "Choose a photo/PDF…"}</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setDoneAttachment(e.target.files?.[0]?.name ?? "")}
                />
              </label>
            </Field>
            {doneTask?.type === "ONE_TIME" && !doneAttachment.trim() && (
              <p className="text-xs text-destructive">Attachment zaroori hai is delegation task ko Done marking se pehle.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoneTask(null)}>
              Cancel
            </Button>
            <Button onClick={submitMarkDone} disabled={doneTask?.type === "ONE_TIME" && !doneAttachment.trim()}>
              <CheckCircle2 /> Mark Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastHost />
    </AppShell>
  );
}

function TaskTable({
  rows,
  onMarkDone,
  kind,
}: {
  rows: TaskRow[];
  onMarkDone: (t: TaskRow) => void;
  kind: "recurring" | "delegation";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Doer</TableHead>
              <TableHead>{kind === "recurring" ? "Frequency" : "Priority"}</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell>{t.branch}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="size-3.5 text-muted-foreground" /> {t.assignedTo}
                  </span>
                </TableCell>
                <TableCell>
                  {kind === "recurring" ? (
                    <FrequencyLabel code={t.frequency} />
                  ) : (
                    <Badge variant={PRIORITY_VARIANT[t.priority ?? "MEDIUM"]}>{t.priority}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.dueAt}</TableCell>
                <TableCell>
                  {t.attachmentName ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="size-3" /> {t.attachmentName}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[t.status]}>{t.status.replace(/_/g, " ")}</Badge>
                </TableCell>
                <TableCell>
                  {t.status !== "DONE" && (
                    <Button variant="outline" size="sm" onClick={() => onMarkDone(t)}>
                      Mark Done
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                  Koi task nahi hai.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
