"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Gauge } from "lucide-react";

interface MyPerformanceTask {
  id: string; title: string; type: "RECURRING" | "ONE_TIME"; branchId: string;
  dueAt: string; completedAt: string | null; status: string;
  outcome: "ON_TIME" | "DELAYED" | "NOT_DONE" | "OPEN";
}
interface MyPerformanceResponse {
  periodStart: string; periodEnd: string;
  totalCount: number; onTimeCount: number; delayedCount: number; notDoneCount: number; openCount: number;
  scorePercent: number | null;
  tasks: MyPerformanceTask[];
}

function todayEat() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function monthStartEat() {
  return `${todayEat().slice(0, 7)}-01`;
}

const OUTCOME_VARIANT: Record<MyPerformanceTask["outcome"], "success" | "warning" | "destructive" | "outline"> = {
  ON_TIME: "success", DELAYED: "warning", NOT_DONE: "destructive", OPEN: "outline",
};

/**
 * "My Performance" — a Doer's own task completion score for a date range
 * (default: current EAT month), with a per-task breakdown explaining
 * exactly why the score is what it is. Self data only — see
 * src/lib/server/my-performance.ts for the scoring rule. Every authenticated
 * user sees their own tasks here regardless of role/module grants, since
 * this only ever reads the actor's own assignedToId rows.
 */
export function MyPerformanceCard() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const [from, setFrom] = React.useState(monthStartEat);
  const [to, setTo] = React.useState(todayEat);
  const [data, setData] = React.useState<MyPerformanceResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!actor.authenticated) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    requestJson<MyPerformanceResponse>(`/api/dashboard/my-performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal: controller.signal })
      .then((d) => setData(d))
      .catch((err) => {
        if (err instanceof RequestJsonError && err.outcome === "unknown") return;
        setError(err instanceof Error ? err.message : "Could not load performance");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [actor.authenticated, actor.id, from, to]);

  if (!actor.authenticated) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gauge className="size-4 text-primary" />{uiText("My Performance", "Mera Performance")}</CardTitle>
        <CardDescription>{uiText("Your own task completion score for the selected period. On-time = full credit, delayed = half credit, not-done = zero — every point traces to a real task below.", "Chuni gayi period ke liye aapka task completion score. On-time = full credit, delayed = half credit, not-done = zero — har point neeche kisi real task se trace hota hai.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 text-xs font-medium"><span>{uiText("From", "From")}</span><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="block space-y-1 text-xs font-medium"><span>{uiText("To", "To")}</span><Input type="date" value={to} min={from} max={todayEat()} onChange={(e) => setTo(e.target.value)} /></label>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{uiText(error)}</p>}

        {loading ? <TableSkeleton cols={4} /> : data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{uiText("Score")}</div>
                <div className="mt-1 text-2xl font-semibold">{data.scorePercent === null ? "—" : `${data.scorePercent}%`}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{uiText("On-time", "On-time")}</div>
                <div className="mt-1 text-2xl font-semibold text-success">{data.onTimeCount}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{uiText("Delayed", "Delayed")}</div>
                <div className="mt-1 text-2xl font-semibold text-warning">{data.delayedCount}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{uiText("Not done", "Not done")}</div>
                <div className="mt-1 text-2xl font-semibold text-destructive">{data.notDoneCount}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{uiText("Still open", "Abhi open")}</div>
                <div className="mt-1 text-2xl font-semibold text-muted-foreground">{data.openCount}</div>
              </div>
            </div>

            {!data.tasks.length ? (
              <p className="text-sm text-muted-foreground">{uiText("No tasks due to you in this period.", "Is period mein aapko koi task due nahi hua.")}</p>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uiText("Task", "Task")}</TableHead>
                      <TableHead>{uiText("Type", "Type")}</TableHead>
                      <TableHead>{uiText("Due", "Due")}</TableHead>
                      <TableHead>{uiText("Completed", "Complete hua")}</TableHead>
                      <TableHead>{uiText("Outcome", "Outcome")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>{task.type === "ONE_TIME" ? uiText("One-time", "One-time") : uiText("Recurring", "Recurring")}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(task.dueAt).toLocaleString("en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "short", timeStyle: "short" })}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{task.completedAt ? new Date(task.completedAt).toLocaleString("en-TZ", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "short", timeStyle: "short" }) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={OUTCOME_VARIANT[task.outcome]}>
                            {task.outcome === "ON_TIME" ? uiText("On-time") : task.outcome === "DELAYED" ? uiText("Delayed") : task.outcome === "NOT_DONE" ? uiText("Not done") : uiText("Still open")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
