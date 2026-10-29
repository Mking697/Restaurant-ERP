"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { REPORT_DEFS, reportReadModule, type ReportSlug } from "@/lib/reports";
import { misCalendarWindow } from "@/lib/mis-period";
import { RevenueTrendChart, MisLeaderboardChart } from "@/components/charts/charts";
import { useSelectedBranchId } from "@/lib/current-branch";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
interface FoodBranch {
  branchId: string; branchName: string; revenueInr: string; cogsInr: string | null; foodCostPercent: number | null; reason: string | null; notes: string[];
  items: { name: string; qtySold: number; revenueInr: string; bomCostPerUnit: number | null; lineCogsInr: string | null; foodCostPercent: number | null; exclusionReason?: string }[];
  excludedOrders: { orderId: string; reason: string }[];
}
interface Score { branchId: string; branchName: string; periodStart: string; periodEnd: string; rank: number; totalScore: string; onTimeCount: number; delayCount: number; notDoneCount: number; componentsUsed: string[] }
const istDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const RevenueChart = RevenueTrendChart as React.ComponentType<{ data: { date: string; revenue: number }[] }>;

export default function ReportDetailContent({ slug }: { slug: ReportSlug }) {
  const branch = useSelectedBranchId();
  const user = useCurrentUser();
  const t = useUiCopy();
  const required = reportReadModule(slug);
  if (!hasCurrentModule(user, required)) return <AppShell activeHref="/reports"><p role="alert">{t(`Requires ${required} access. Ask an administrator to grant it.`, `${required} access chahiye. Administrator se grant maango.`)}</p></AppShell>;
  // Remount synchronously on identity/scope/grant changes: stale results and
  // CSV exports cannot survive a branch switch before effect cleanup runs.
  return <ReportView key={`${slug}:${branch}:${user.id}:${user.role}:${user.moduleAccess.join(",")}`} slug={slug} branch={branch} />;
}
function ReportView({ slug, branch }: { slug: ReportSlug; branch: string }) {
  const t = useUiCopy();
  const def = REPORT_DEFS.find((r) => r.slug === slug)!;
  const [month, setMonth] = React.useState(() => istDate(new Date()).slice(0, 7));
  const [days, setDays] = React.useState("14");
  const [from, setFrom] = React.useState(() => istDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = React.useState(() => istDate(new Date()));
  const period = ["food-cost", "aggregator-recon"].includes(slug) ? month : slug === "sales-trend" ? days : `${from}:${to}`;
  return <AppShell activeHref="/reports">
    <PageHeader title={t(def.title)} description={t("Real database rows. Unavailable metrics show — with a reason; recipe costs use current vendor rates, not historical posted COGS.")} />
    <div className="mb-4 flex flex-wrap gap-3">
      {["food-cost", "aggregator-recon"].includes(slug) ? <label className="text-sm">{t("Month (IST)")}<input className="mt-1 block rounded border bg-background px-3 py-2" aria-label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      : slug === "sales-trend" ? <label className="text-sm">{t("Days (1–90)")}<input className="mt-1 block rounded border bg-background px-3 py-2" aria-label="Days" type="number" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)} /></label>
      : <><label className="text-sm">{t("From (IST)")}<input className="mt-1 block rounded border bg-background px-3 py-2" aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-sm">{t("To (IST, inclusive)")}<input className="mt-1 block rounded border bg-background px-3 py-2" aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></>}
    </div>
    <LoadedReport key={period} {...{ slug, branch, month, days, from, to }} />
  </AppShell>;
}
function LoadedReport({ slug, branch, month, days, from, to }: { slug: ReportSlug; branch: string; month: string; days: string; from: string; to: string }) {
  const t = useUiCopy();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [summary, setSummary] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (branch === "__no_branch__") return;
    const controller = new AbortController();
    let active = true;
    const run = async () => {
      const params = new URLSearchParams(branch === "all" ? {} : { branchId: branch });
      let next: Row[] = [], summaries: Row[] = [], messages: string[] = [];
      const get = <T,>(path: string) => requestJson<T>(`${path}?${params}`, { signal: controller.signal });
      if (slug === "sales-trend") {
        params.set("days", days);
        const data = await get<{ trend: { date: string; revenueInr: string; orderCount: number }[] }>("/api/reports/sales-trend");
        next = data.trend.map((r) => ({ Date: r.date, RevenueInr: Number(r.revenueInr), Orders: r.orderCount }));
        messages = ["Daily prime cost trend unavailable: period-allocated labor cost is not connected."];
      } else if (slug === "food-cost") {
        params.set("month", month);
        const data = await get<{ branches: FoodBranch[] }>("/api/reports/food-cost");
        summaries = data.branches.map((b) => ({ Branch: b.branchName, RevenueInr: b.revenueInr, CogsInr: b.cogsInr, FoodCostPercent: b.foodCostPercent, Reason: b.reason }));
        next = data.branches.flatMap((b) => b.items.map((r) => ({ Branch: b.branchName, MenuItem: r.name, QtySold: r.qtySold, RevenueInr: r.revenueInr, BomCostPerUnit: r.bomCostPerUnit, CogsInr: r.lineCogsInr, FoodCostPercent: r.foodCostPercent, Reason: r.exclusionReason ?? null })));
        messages = [...new Set(data.branches.flatMap((b) => [...b.notes, ...b.excludedOrders.map((o) => `${b.branchName}: order ${o.orderId}: ${o.reason}`)]))];
      } else if (slug === "mis-scorecard") {
        const window = misCalendarWindow(from, to);
        params.set("periodStart", window.periodStart); params.set("periodEnd", window.periodEnd);
        const data = await get<{ scores: Score[] }>("/api/mis/scores");
        next = data.scores.map((r) => ({ Branch: r.branchName, PeriodStart: r.periodStart, PeriodEnd: r.periodEnd, Rank: r.rank, OnTime: r.onTimeCount, Delay: r.delayCount, NotDone: r.notDoneCount, Score: Number(r.totalScore), ComponentsUsed: r.componentsUsed.join(", ") }));
        messages = ["Historical branch snapshots within the selected IST dates; multiple periods may appear. Rank compares snapshots, not distinct branches. ComponentsUsed lists measured components; weights are re-normalized."];
      } else if (slug === "cash-reconciliation") {
        params.set("from", from); params.set("to", to);
        const data = await get<{ rows: { branchName: string; cashierName: string; shiftDate: string; closedAt: string; expectedCashInr: string; countedCashInr: string; shortageExcessInr: string }[] }>("/api/reports/cash-reconciliation");
        next = data.rows.map((r) => ({ Branch: r.branchName, Cashier: r.cashierName, ShiftStart: r.shiftDate, ClosedAt: r.closedAt, ExpectedInr: r.expectedCashInr, CountedInr: r.countedCashInr, VarianceInr: r.shortageExcessInr }));
        messages = ["Actual stored closing variance includes all physical cash, including Owner-only sales. Filter is the shift closing date (IST)."];
      } else if (slug === "aggregator-recon") {
        params.set("month", month);
        const data = await get<{ orders: { branchId: string; orderDate: string; channel: string; orderValue: string; commissionAmount: string; adsAmount: string; refundPenalty: string; netPayout: string }[] }>("/api/accounts/aggregator-orders");
        next = data.orders.map((r) => ({ BranchId: r.branchId, Date: r.orderDate, Channel: r.channel, OrderValueInr: r.orderValue, CommissionInr: r.commissionAmount, AdsInr: r.adsAmount, RefundPenaltyInr: r.refundPenalty, NetPayoutInr: r.netPayout }));
      } else {
        params.set("from", from); params.set("to", to);
        const data = await get<{ entries: { branchId: string; rawMaterialName: string; shiftDate: string; theoreticalQty: string; physicalQty: string; varianceValueInr: string; flaggedPilferage: boolean }[] }>("/api/inventory/variance");
        next = data.entries.map((r) => ({ BranchId: r.branchId, Material: r.rawMaterialName, Date: r.shiftDate, TheoreticalQty: r.theoreticalQty, PhysicalQty: r.physicalQty, VarianceInr: r.varianceValueInr, PilferageFlag: r.flaggedPilferage }));
      }
      if (active) { setRows(next); setSummary(summaries); setNotes(messages); setLoading(false); }
    };
    void run().catch((e: unknown) => { if (active) { setRows([]); setSummary([]); setError(e instanceof Error ? e.message : "Report unavailable"); setLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [slug, branch, month, days, from, to]);
  return <>
    <div className="mb-4 flex gap-3"><ExportButton filename={slug} rows={error || loading ? [] : rows} />{summary.length > 0 && <ExportButton filename={`${slug}-branch-summary`} rows={summary} />}</div>
    {loading && <p role="status">{t("Loading real records…")}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notes.map((note) => <p key={note} className="mb-2 text-xs text-muted-foreground">{t(note)}</p>)}
    {summary.length > 0 && <Card className="mb-4"><CardHeader><CardTitle>{t("Per-branch food cost summary")}</CardTitle></CardHeader><CardContent><RowsTable rows={summary} /></CardContent></Card>}
    {!error && !loading && <Card><CardContent className="pt-5">
      {slug === "sales-trend" && <RevenueChart data={rows.map((r) => ({ date: String(r.Date), revenue: Number(r.RevenueInr) }))} />}
      {slug === "mis-scorecard" && rows.length > 0 && <MisLeaderboardChart data={rows.map((r) => ({ name: `${r.Branch} (${r.PeriodStart} – ${r.PeriodEnd})`, totalScore: Number(r.Score) }))} />}
      {rows.length ? <RowsTable rows={rows} /> : <p className="text-sm text-muted-foreground">{t("No real rows in this scope/period. No values have been invented.")}</p>}
    </CardContent></Card>}
  </>;
}
function RowsTable({ rows }: { rows: Row[] }) {
  const t = useUiCopy();
  const columns = Object.keys(rows[0] ?? {});
  return <Table><TableHeader><TableRow>{columns.map((key) => <TableHead key={key}>{t(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, i) => <TableRow key={i}>{columns.map((key) => <TableCell key={key}>{row[key] === null || row[key] === undefined ? "—" : String(row[key])}</TableCell>)}</TableRow>)}</TableBody></Table>;
}
