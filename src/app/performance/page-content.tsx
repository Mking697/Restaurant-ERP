"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MisLeaderboardChart } from "@/components/charts/charts";
import { formatPercent } from "@/lib/utils";
import { misCalendarWindow } from "@/lib/mis-period";
import { downloadCsv } from "@/lib/csv-export";
import { Download, Calculator } from "lucide-react";
import { hasCurrentModule, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { ActionState, Field, inputClass, LoadState, Panel, post, useAction, useResource } from "../workforce/live-ui";

interface MisScoreRow {
  id: string; branchId: string; branchName: string; periodStart: string; periodEnd: string;
  taskScore: string | null; delegationScore: string | null; varianceScore: string | null; cashierScore: string | null; totalScore: string;
  onTimeCount: number; delayCount: number; notDoneCount: number;
  componentsUsed: ("taskScore" | "delegationScore" | "varianceScore" | "cashierScore")[];
  rank: number;
}

function todayIst() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function daysAgo(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
// Calendar pickers select inclusive IST dates; compute/read share exact
// start-inclusive/end-exclusive timestamp bounds.

export default function PerformancePage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const identity = `${actor.id}:${actor.authenticated}:${actor.role}:${actor.branchId}:${selected}:${actor.moduleAccess.join(",")}`;
  return <AppShell activeHref="/performance"><PerformanceScope key={identity} selected={selected} /></AppShell>;
}

function PerformanceScope({ selected }: { selected: string }) {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const { error: branchError } = useBranches();
  const canView = hasCurrentModule(actor, "MIS_PERFORMANCE");
  const canCompute = actor.role === "SUPER_ADMIN" || actor.role === "CENTRAL_STORE_MGR";
  const scopedBranchId = actor.role === "SUPER_ADMIN" ? (selected === "all" ? "" : selected) : (actor.branchId ?? "");
  const branchId = scopedBranchId && scopedBranchId !== "__no_branch__" ? scopedBranchId : "";

  const today = todayIst();
  const [periodStart, setPeriodStart] = React.useState(() => daysAgo(today, 30));
  const [periodEnd, setPeriodEnd] = React.useState(today);

  let window: ReturnType<typeof misCalendarWindow> | null = null;
  try { window = misCalendarWindow(periodStart, periodEnd); } catch { /* invalid input stays disabled */ }
  const validPeriod = window !== null;
  const params = new URLSearchParams(window ? { ...window, periodMatch: "exact" } : {});
  if (branchId) params.set("branchId", branchId);
  const resource = useResource<{ scores: MisScoreRow[] }>(canView && validPeriod ? `/api/mis/scores?${params.toString()}` : null);
  const action = useAction();

  async function computeNow() {
    await action.run(async () => {
      if (!window) throw new Error("Select 1–31 inclusive IST days");
      await post("/api/mis/compute", { ...(branchId ? { branchId } : {}), ...window });
      await resource.reload();
    }, uiText("MIS scores computed for the selected period.", "Selected period ke liye MIS scores compute ho gaye."));
  }

  const rows = [...(resource.data?.scores ?? [])].sort((a, b) => Number(b.totalScore) - Number(a.totalScore));

  function exportCsv() {
    downloadCsv(
      "mis-leaderboard",
      rows.map((r) => ({
        Rank: r.rank,
        Branch: r.branchName,
        OnTime: r.onTimeCount,
        Delay: r.delayCount,
        NotDone: r.notDoneCount,
        TaskScore: r.taskScore,
        DelegationScore: r.delegationScore,
        VarianceScore: r.varianceScore,
        CashierScore: r.cashierScore,
        ComponentsUsed: r.componentsUsed.join("+"),
        MisScore: r.totalScore,
      }))
    );
  }

  if (!canView) {
    return <Panel><p role="alert">{uiText("MIS_PERFORMANCE grant is required to view the leaderboard.", "MIS leaderboard dekhne ke liye MIS_PERFORMANCE grant chahiye.")}</p></Panel>;
  }

  return (
    <>
      <PageHeader
        title={uiText("Team Performance — MIS Leaderboard")}
        description={uiText("Real 40% task / 30% delegation / 20% variance / 10% cashier weighted score, computed from actual tasks, night variance and shift data — never a sample.", "Real 40% task / 30% delegation / 20% variance / 10% cashier weighted score, asli tasks, night variance aur shift data se compute hota hai — sample nahi.")}
      >
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download /> {uiText(" Export CSV ")}
        </Button>
      </PageHeader>
      {branchError && <p role="alert" className="mb-3 text-destructive">{branchError}</p>}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{uiText("Period & Compute")}</CardTitle>
          <CardDescription>{uiText("A branch with zero real rows for every component in this window is skipped, not scored at 0% or 100%.", "Jis branch ke is window mein har component ke liye zero real rows hain use skip kiya jata hai, 0% ya 100% nahi diya jata.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label={uiText("Period start (IST, inclusive)")}>
            <input type="date" disabled={action.busy} className={inputClass} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} max={periodEnd} />
          </Field>
          <Field label={uiText("Period end (IST, inclusive)")}>
            <input type="date" disabled={action.busy} className={inputClass} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} min={periodStart} max={today} />
          </Field>
          {canCompute && (
            <Button size="sm" disabled={action.busy || !validPeriod} onClick={() => void computeNow()}>
              <Calculator /> {action.busy ? uiText("Computing…", "Compute ho raha hai…") : uiText("Compute MIS", "MIS Compute Karo")}
            </Button>
          )}
          <ActionState action={action} />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{uiText("Score by branch")}</CardTitle>
          <CardDescription>{uiText("Base weights: tasks 40%, delegation 30%, inventory variance 20%, cashier 10%. Missing components are excluded; remaining weights are re-normalized to 100%.", "Base weights: tasks 40%, delegation 30%, inventory variance 20%, cashier 10%. Missing components hatakar baaki weights ko 100% kiya jata hai.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoadState loading={resource.loading} error={resource.error} empty={!rows.length} reload={resource.reload} />
          {!resource.loading && !resource.error && rows.length > 0 && (
            <MisLeaderboardChart data={rows.map((r) => ({ name: r.branchName, totalScore: Number(r.totalScore) }))} />
          )}
        </CardContent>
      </Card>

      {!resource.loading && !resource.error && rows.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiText("Rank")}</TableHead>
                  <TableHead>{uiText("Branch")}</TableHead>
                  <TableHead className="text-center">{uiText("On Time")}</TableHead>
                  <TableHead className="text-center">{uiText("Delay")}</TableHead>
                  <TableHead className="text-center">{uiText("Not Done")}</TableHead>
                  <TableHead>{uiText("Components used")}</TableHead>
                  <TableHead className="text-right">{uiText("MIS Score")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">#{r.rank}</TableCell>
                    <TableCell className="font-medium">{r.branchName}</TableCell>
                    <TableCell className="text-center">{r.onTimeCount}</TableCell>
                    <TableCell className="text-center">{r.delayCount}</TableCell>
                    <TableCell className="text-center">{r.notDoneCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.componentsUsed.length === 4
                          ? <Badge variant="outline">{uiText("All 4")}</Badge>
                          : r.componentsUsed.map((c) => <Badge key={c} variant="outline">{c.replace("Score", "")}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={Number(r.totalScore) >= 85 ? "success" : Number(r.totalScore) >= 70 ? "warning" : "destructive"}>
                        {formatPercent(Number(r.totalScore))}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
