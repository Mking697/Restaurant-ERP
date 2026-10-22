"use client";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RevenueTrendChart, BranchRevenueBarChart, ChannelSplitPieChart } from "@/components/charts/charts";
import { getBranchKpis, getRevenueTrend14d, getAggregatorSplit } from "@/lib/mock-data";
import { useSelectedBranchId } from "@/lib/current-branch";
import { formatInr, formatPercent } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertTriangle, Trophy, Boxes, BookOpenCheck, ArrowRight } from "lucide-react";

export default function DashboardPage() {
  const selectedBranchId = useSelectedBranchId();
  const allBranches = getBranchKpis();
  const branches = selectedBranchId === "all" ? allBranches : allBranches.filter((b) => b.branchId === selectedBranchId);
  const trend = getRevenueTrend14d();
  const split = getAggregatorSplit();
  const isSingleBranch = selectedBranchId !== "all";

  const totalRevenueToday = branches.reduce((s, b) => s + b.revenueToday, 0);
  const totalRevenueMtd = branches.reduce((s, b) => s + b.revenueMtd, 0);
  const avgPrimeCost = branches.length ? branches.reduce((s, b) => s + b.primeCostPercent, 0) / branches.length : 0;
  const totalOverdue = branches.reduce((s, b) => s + b.openTasksOverdue, 0);
  const totalInventoryValue = branches.reduce((s, b) => s + b.totalInventoryValueInr, 0);
  const bestBranch = [...branches].sort((a, b) => b.misScore - a.misScore)[0];

  return (
    <AppShell activeHref="/dashboard">
      <PageHeader
        title={isSingleBranch ? `${branches[0]?.branchName} — Branch Dashboard` : "Owner Dashboard — All 6 Branches Compiled"}
        description={
          isSingleBranch
            ? `Sirf ${branches[0]?.branchName} ka data — yeh branch doosri branches ka data bilkul nahi dekh sakti, isolation real hai.`
            : "Live sales, prime cost, total inventory, MIS compliance aur pilferage alerts — ek hi screen par. Branch selector (top-left) se kisi ek branch par bhi drill-down kar sakte ho."
        }
      />

      <a
        href="/guide"
        className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm transition-colors hover:bg-primary/10"
      >
        <span className="flex items-center gap-2 font-medium">
          <BookOpenCheck className="size-4 text-primary" />
          Naya ho yahan? Guide Book kholo — har module kya karta hai, kaise use hota hai, example ke saath samjho.
        </span>
        <ArrowRight className="size-4 shrink-0 text-primary" />
      </a>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label={isSingleBranch ? "Sales — Today" : "Total Sales — Today (all branches)"}
          value={formatInr(totalRevenueToday)}
          icon={<TrendingUp className="size-4 text-success" />}
          footer={`MTD: ${formatInr(totalRevenueMtd)}`}
        />
        <KpiCard
          label={isSingleBranch ? "Inventory Value" : "Total Inventory Value"}
          value={formatInr(totalInventoryValue)}
          icon={<Boxes className="size-4 text-primary" />}
          footer={isSingleBranch ? branches[0]?.branchName : "Across all branches"}
        />
        <KpiCard
          label="Avg. Prime Cost %"
          value={formatPercent(avgPrimeCost)}
          icon={<TrendingDown className="size-4 text-warning" />}
          footer="Target: < 60%"
        />
        <KpiCard
          label="Overdue Tasks"
          value={String(totalOverdue)}
          icon={<AlertTriangle className="size-4 text-destructive" />}
          footer={isSingleBranch ? branches[0]?.branchName : "Across all branches"}
        />
        <KpiCard
          label={isSingleBranch ? "MIS Score" : "Top MIS Branch"}
          value={isSingleBranch ? formatPercent(branches[0]?.misScore ?? 0) : bestBranch?.branchName ?? "—"}
          icon={<Trophy className="size-4 text-primary" />}
          footer={isSingleBranch ? branches[0]?.branchName : `Score ${formatPercent(bestBranch?.misScore ?? 0)}`}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue trend — last 14 days</CardTitle>
            <CardDescription>{isSingleBranch ? branches[0]?.branchName : "Compiled across all branches"}</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Order channel split</CardTitle>
            <CardDescription>Dine-in / Takeaway / Swiggy / Zomato</CardDescription>
          </CardHeader>
          <CardContent>
            <ChannelSplitPieChart data={split} />
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{isSingleBranch ? "Revenue today" : "Revenue today by branch"}</CardTitle>
          </CardHeader>
          <CardContent>
            <BranchRevenueBarChart data={branches} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pilferage watch</CardTitle>
            <CardDescription>Night variance flags this week</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {branches
              .filter((b) => b.pilferageFlags > 0)
              .map((b) => (
                <div key={b.branchId} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">{b.branchName}</div>
                    <div className="text-xs text-muted-foreground">Cash variance: {formatInr(b.cashVarianceInr)}</div>
                  </div>
                  <Badge variant="destructive">{b.pilferageFlags} flag(s)</Badge>
                </div>
              ))}
            {branches.every((b) => b.pilferageFlags === 0) && (
              <p className="text-sm text-muted-foreground">Koi pilferage flag nahi — sab clean hai 🎉</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isSingleBranch ? "Branch detail" : "Branch drill-down"}</CardTitle>
          <CardDescription>
            {isSingleBranch
              ? "Yeh branch sirf apna data dekh rahi hai — doosri 5 branches ki rows yahan bilkul nahi aa rahin."
              : "Branch selector (top-left) se kisi ek branch par filter karo — sirf uska data dikhega."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Revenue Today</TableHead>
                <TableHead>Inventory Value</TableHead>
                <TableHead>Prime Cost %</TableHead>
                <TableHead>Food Cost %</TableHead>
                <TableHead>Overdue Tasks</TableHead>
                <TableHead>MIS Score</TableHead>
                <TableHead>Cash Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.branchId}>
                  <TableCell className="font-medium">{b.branchName}</TableCell>
                  <TableCell>{formatInr(b.revenueToday)}</TableCell>
                  <TableCell>{formatInr(b.totalInventoryValueInr)}</TableCell>
                  <TableCell>
                    <Badge variant={b.primeCostPercent > 60 ? "destructive" : "success"}>
                      {formatPercent(b.primeCostPercent)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatPercent(b.foodCostPercent)}</TableCell>
                  <TableCell>
                    {b.openTasksOverdue > 0 ? (
                      <Badge variant="warning">{b.openTasksOverdue}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>{formatPercent(b.misScore)}</TableCell>
                  <TableCell className={b.cashVarianceInr < 0 ? "text-destructive" : "text-success"}>
                    {formatInr(b.cashVarianceInr)}
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
