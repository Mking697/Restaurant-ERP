"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RevenueTrendChart, BranchRevenueBarChart, ChannelSplitPieChart } from "@/components/charts/charts";
import { useSelectedBranchId } from "@/lib/current-branch";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { formatInr, formatPercent } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertTriangle, Trophy, Boxes, BookOpenCheck, ArrowRight } from "lucide-react";

interface BranchKpi {
  branchId: string; branchName: string;
  revenueTodayInr: string; revenueMtdInr: string;
  totalInventoryValueInr: number; ratesMissingForCount: number;
  openTasksOverdue: number;
  misScore: number | null; misScoreNote: string | null;
  cashVarianceInr: number | null; cashVarianceNote: string | null;
  pilferageFlags: number;
  primeCostPercent: number | null; primeCostNote: string | null;
  foodCostPercent: number | null; foodCostExcludedCount: number; foodCostNote: string | null;
}
interface KpisResponse { branches: BranchKpi[]; channelSplit: { channel: string; revenueInr: number }[]; compiled: boolean; asOf: string }
interface TrendResponse { trend: { date: string; label: string; revenueInr: string; orderCount: number }[] }

function errMsg(err: unknown, fallback: string) {
  return err instanceof RequestJsonError ? err.message : err instanceof Error ? err.message : fallback;
}

export default function DashboardPage() {
  const branch = useSelectedBranchId();
  const user = useCurrentUser();
  return <DashboardContent key={`${branch}:${user.id}:${user.role}:${user.moduleAccess.join(",")}`} />;
}
const RevenueChart = RevenueTrendChart as React.ComponentType<{ data: { date: string; revenue: number }[] }>;
function DashboardContent() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const canReadTrend = hasCurrentModule(actor, "REPORTS");
  const selectedBranchId = useSelectedBranchId();
  const isSingleBranch = selectedBranchId !== "all" && selectedBranchId !== "__no_branch__";
  const [kpis, setKpis] = React.useState<KpisResponse | null>(null);
  const [trend, setTrend] = React.useState<TrendResponse["trend"]>([]);
  const [loadError, setLoadError] = React.useState("");

  React.useEffect(() => {
    if (selectedBranchId === "__no_branch__") return;
    const branchQuery = isSingleBranch ? `?branchId=${encodeURIComponent(selectedBranchId)}` : "";
    const controller = new AbortController();
    let active = true;
    setLoadError("");
    requestJson<KpisResponse>(`/api/dashboard/kpis${branchQuery}`, { signal: controller.signal }).then((data) => { if (active) setKpis(data); }).catch((err) => { if (active) setLoadError(errMsg(err, "Could not load dashboard KPIs")); });
    if (canReadTrend) requestJson<TrendResponse>(`/api/reports/sales-trend${branchQuery}${branchQuery ? "&" : "?"}days=14`, { signal: controller.signal }).then((data) => { if (active) setTrend(data.trend); }).catch((err) => { if (active) setLoadError(errMsg(err, "Revenue trend unavailable")); });
    return () => { active = false; controller.abort(); };
  }, [selectedBranchId, isSingleBranch, canReadTrend]);

  const branches = kpis?.branches ?? [];
  const activeBranch = isSingleBranch ? branches[0] : undefined;

  const totalRevenueToday = branches.reduce((s, b) => s + Number(b.revenueTodayInr), 0);
  const totalRevenueMtd = branches.reduce((s, b) => s + Number(b.revenueMtdInr), 0);
  const foodCostValues = branches.map((b) => b.foodCostPercent).filter((v): v is number => v !== null);
  const avgFoodCost = foodCostValues.length ? foodCostValues.reduce((s, v) => s + v, 0) / foodCostValues.length : null;
  const totalOverdue = branches.reduce((s, b) => s + b.openTasksOverdue, 0);
  const totalInventoryValue = branches.reduce((s, b) => s + b.totalInventoryValueInr, 0);
  const anyRatesMissing = branches.reduce((s, b) => s + b.ratesMissingForCount, 0);
  const misScored = branches.filter((b) => b.misScore !== null);
  const bestBranch = misScored.length ? [...misScored].sort((a, b) => (b.misScore ?? 0) - (a.misScore ?? 0))[0] : undefined;
  const trendForChart = trend.map((t) => ({ date: t.label, revenue: Number(t.revenueInr) }));
  const channelSplitForChart = (kpis?.channelSplit ?? []).filter((c) => c.revenueInr > 0).map((c) => ({ name: c.channel, value: c.revenueInr }));

  return (
    <AppShell activeHref="/dashboard">
      <PageHeader
        title={isSingleBranch ? uiText(`${activeBranch?.branchName ?? ""} — Branch Dashboard`, `${activeBranch?.branchName ?? ""} — Branch Dashboard`) : uiText("Owner Dashboard — All Branches Compiled")}
        description={
          isSingleBranch
            ? uiText(`Real data for ${activeBranch?.branchName ?? "this branch"}.`, `${activeBranch?.branchName ?? "Yeh branch"} ka real data.`)
            : uiText("Real branch sales, inventory valuation, overdue tasks and saved MIS scores. Select a branch to drill down; unavailable costs remain unmeasured.", "Real branch sales, inventory valuation, overdue tasks aur saved MIS scores. Branch chuno aur detail dekho; unavailable costs ko measured nahi maana jata.")
        }
      />

      {loadError && <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{loadError}</p>}

      <a
        href="/guide"
        className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm transition-colors hover:bg-primary/10"
      >
        <span className="flex items-center gap-2 font-medium">
          <BookOpenCheck className="size-4 text-primary" />
          {uiText(" Naya ho yahan? Guide Book kholo — har module kya karta hai, kaise use hota hai, example ke saath samjho. ")}</span>
        <ArrowRight className="size-4 shrink-0 text-primary" />
      </a>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label={isSingleBranch ? uiText("Sales — Today") : uiText("Total Sales — Today (all branches)")}
          value={kpis ? formatInr(totalRevenueToday) : "—"}
          icon={<TrendingUp className="size-4 text-success" />}
          footer={kpis ? `MTD: ${formatInr(totalRevenueMtd)}` : uiText("Loading real records…")}
        />
        <KpiCard
          label={isSingleBranch ? uiText("Inventory Value") : uiText("Total Inventory Value")}
          value={kpis ? formatInr(totalInventoryValue) : "—"}
          icon={<Boxes className="size-4 text-primary" />}
          footer={anyRatesMissing ? uiText(`${anyRatesMissing} material(s) missing a vendor rate — excluded from this total`) : (isSingleBranch ? activeBranch?.branchName : "Across all branches")}
        />
        <KpiCard
          label={uiText("Avg. Food Cost %")}
          value={avgFoodCost === null ? "—" : formatPercent(avgFoodCost)}
          icon={<TrendingDown className="size-4 text-warning" />}
          footer={avgFoodCost === null ? uiText("No positive sales / complete recipe+rate chain yet") : `${foodCostValues.length}/${branches.length} branches measured; arithmetic mean of branch estimates`}
        />
        <KpiCard
          label={uiText("Overdue Tasks")}
          value={kpis ? String(totalOverdue) : "—"}
          icon={<AlertTriangle className="size-4 text-destructive" />}
          footer={isSingleBranch ? activeBranch?.branchName : "Across all branches"}
        />
        <KpiCard
          label={isSingleBranch ? uiText("MIS Score") : uiText("Top MIS Branch")}
          value={isSingleBranch ? (activeBranch?.misScore === null || activeBranch?.misScore === undefined ? "—" : formatPercent(activeBranch.misScore)) : (bestBranch?.branchName ?? "—")}
          icon={<Trophy className="size-4 text-primary" />}
          footer={isSingleBranch ? (activeBranch?.misScoreNote ?? activeBranch?.branchName) : (bestBranch ? `Score ${formatPercent(bestBranch.misScore ?? 0)}` : uiText("No MIS scores computed yet"))}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{uiText("Revenue trend — last 14 days")}</CardTitle>
            <CardDescription>{isSingleBranch ? activeBranch?.branchName : uiText("Compiled across all branches")}</CardDescription>
          </CardHeader>
          <CardContent>
            {canReadTrend ? <RevenueChart data={trendForChart} /> : <p className="text-sm text-muted-foreground">{uiText("Revenue trend requires REPORTS access. Dashboard totals remain available.", "Revenue trend ke liye REPORTS access chahiye. Dashboard totals available hain.")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{uiText("Order channel split")}</CardTitle>
            <CardDescription>{uiText("Dine-in / Takeaway / Swiggy / Zomato — month to date revenue")}</CardDescription>
          </CardHeader>
          <CardContent>
            {channelSplitForChart.length ? <ChannelSplitPieChart data={channelSplitForChart} /> : <p className="text-sm text-muted-foreground">{uiText(kpis ? "No completed sales this month yet." : "Loading real records…")}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{isSingleBranch ? uiText("Revenue today") : uiText("Revenue today by branch")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BranchRevenueBarChart data={branches.map((b) => ({ branchName: b.branchName, revenueToday: Number(b.revenueTodayInr) }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{uiText("Pilferage watch")}</CardTitle>
            <CardDescription>{uiText("Night variance flags — trailing 30 days")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {branches
              .filter((b) => b.pilferageFlags > 0)
              .map((b) => (
                <div key={b.branchId} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">{b.branchName}</div>
                    <div className="text-xs text-muted-foreground">{uiText("Cash variance: ")}{b.cashVarianceInr === null ? "—" : formatInr(b.cashVarianceInr)}</div>
                  </div>
                  <Badge variant="destructive">{b.pilferageFlags} {uiText(" flag(s)")}</Badge>
                </div>
              ))}
            {branches.length > 0 && branches.every((b) => b.pilferageFlags === 0) && (
              <p className="text-sm text-muted-foreground">{uiText("No pilferage flags recorded in the trailing 30 days.")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isSingleBranch ? uiText("Branch detail") : uiText("Branch drill-down")}</CardTitle>
          <CardDescription>
            {isSingleBranch
              ? uiText("Yeh branch sirf apna data dekh rahi hai — doosri branches ki rows yahan bilkul nahi aa rahin.")
              : uiText("Branch selector (top-left) se kisi ek branch par filter karo — sirf uska data dikhega.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{uiText("Branch")}</TableHead>
                <TableHead>{uiText("Revenue Today")}</TableHead>
                <TableHead>{uiText("Inventory Value")}</TableHead>
                <TableHead>{uiText("Prime Cost %")}</TableHead>
                <TableHead>{uiText("Food Cost %")}</TableHead>
                <TableHead>{uiText("Overdue Tasks")}</TableHead>
                <TableHead>{uiText("MIS Score")}</TableHead>
                <TableHead>{uiText("Cash Variance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.branchId}>
                  <TableCell className="font-medium">{b.branchName}</TableCell>
                  <TableCell>{formatInr(Number(b.revenueTodayInr))}</TableCell>
                  <TableCell>{formatInr(b.totalInventoryValueInr)}{b.ratesMissingForCount ? <span className="ml-1 text-xs text-muted-foreground">({b.ratesMissingForCount} missing rate)</span> : null}</TableCell>
                  <TableCell><span className="text-muted-foreground" title={b.primeCostNote ?? ""}>N/A</span></TableCell>
                  <TableCell>
                    {b.foodCostPercent === null ? (
                      <span className="text-muted-foreground" title={b.foodCostNote ?? "No complete recipe+rate chain for sold items this month"}>—</span>
                    ) : (
                      <Badge variant={b.foodCostPercent > 35 ? "destructive" : "success"}>{formatPercent(b.foodCostPercent)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {b.openTasksOverdue > 0 ? (
                      <Badge variant="warning">{b.openTasksOverdue}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>{b.misScore === null ? <span className="text-muted-foreground" title={b.misScoreNote ?? ""}>—</span> : formatPercent(b.misScore)}</TableCell>
                  <TableCell className={b.cashVarianceInr === null ? "text-muted-foreground" : b.cashVarianceInr < 0 ? "text-destructive" : "text-success"}>
                    {b.cashVarianceInr === null ? "—" : formatInr(b.cashVarianceInr)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  footer,
  icon,
}: {
  label: string;
  value: string;
  footer?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {footer && <div className="mt-1 text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}
