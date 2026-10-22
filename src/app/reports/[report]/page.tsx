import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REPORT_DEFS, type ReportSlug } from "@/lib/reports";
import {
  getRevenueTrend14d,
  getMisLeaderboard,
  getFoodCostReport,
  getCashReconciliation,
  getAggregatorRecon,
  getVarianceReport,
} from "@/lib/mock-data";
import { RevenueTrendChart, PrimeCostTrendChart, MisLeaderboardChart } from "@/components/charts/charts";
import { formatInr, formatPercent } from "@/lib/utils";

export function generateStaticParams() {
  return REPORT_DEFS.map((r) => ({ report: r.slug }));
}

function exportRowsFor(slug: ReportSlug): Record<string, unknown>[] {
  switch (slug) {
    case "sales-trend":
      return getRevenueTrend14d().map((t) => ({ Date: t.date, Revenue: t.revenue, PrimeCostPercent: t.primeCostPercent }));
    case "mis-scorecard":
      return getMisLeaderboard().map((r) => ({
        Name: r.name,
        Role: r.role,
        Branch: r.branch,
        OnTime: r.onTimeCount,
        Delay: r.delayCount,
        NotDone: r.notDoneCount,
        MisScore: r.totalScore,
      }));
    case "food-cost":
      return getFoodCostReport().map((r) => ({
        MenuItem: r.menuItem,
        Branch: r.branch,
        SellingPrice: r.sellingPrice,
        BomCost: r.bomCost,
        FoodCostPercent: r.foodCostPercent,
        Margin: r.marginInr,
      }));
    case "inventory-variance":
      return getVarianceReport().map((r) => ({
        RawMaterial: r.rawMaterial,
        Branch: r.branch,
        TheoreticalQty: r.theoreticalQty,
        PhysicalQty: r.physicalQty,
        VarianceValue: r.varianceValueInr,
        FlaggedPilferage: r.flaggedPilferage ? "Yes" : "No",
      }));
    case "cash-reconciliation":
      return getCashReconciliation().map((r) => ({
        Cashier: r.cashier,
        Branch: r.branch,
        Shift: r.shiftDate,
        Expected: r.expectedInr,
        Counted: r.countedInr,
        ShortageExcess: r.shortageExcessInr,
      }));
    case "aggregator-recon":
      return getAggregatorRecon().map((r) => ({
        Channel: r.channel,
        Branch: r.branch,
        OrderValue: r.orderValue,
        Commission: r.commissionAmount,
        Ads: r.adsAmount,
        RefundPenalty: r.refundPenalty,
        NetPayout: r.netPayout,
      }));
    default:
      return [];
  }
}

export default async function ReportDetailPage({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const def = REPORT_DEFS.find((r) => r.slug === report);
  if (!def) notFound();
  const slug = report as ReportSlug;

  return (
    <AppShell activeHref="/reports">
      <PageHeader title={def.title} description={def.description}>
        <ExportButton filename={slug} rows={exportRowsFor(slug)} />
      </PageHeader>
      <ReportBody slug={slug} />
    </AppShell>
  );
}

function ReportBody({ slug }: { slug: ReportSlug }) {
  switch (slug) {
    case "sales-trend": {
      const trend = getRevenueTrend14d();
      return (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue — last 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueTrendChart data={trend} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Prime cost % trend</CardTitle>
            </CardHeader>
            <CardContent>
              <PrimeCostTrendChart data={trend} />
            </CardContent>
          </Card>
        </div>
      );
    }
    case "mis-scorecard": {
      const rows = getMisLeaderboard();
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>MIS score by person</CardTitle>
            </CardHeader>
            <CardContent>
              <MisLeaderboardChart data={rows.map((r) => ({ name: r.name, totalScore: r.totalScore }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>On Time</TableHead>
                    <TableHead>Delay</TableHead>
                    <TableHead>Not Done</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.onTimeCount}</TableCell>
                      <TableCell>{r.delayCount}</TableCell>
                      <TableCell>{r.notDoneCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      );
    }
    case "food-cost": {
      const rows = getFoodCostReport();
      return (
        <Card>
          <CardHeader>
            <CardTitle>Food cost % + margin per menu item</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Menu Item</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Selling Price</TableHead>
                  <TableHead>BOM Cost</TableHead>
                  <TableHead>Food Cost %</TableHead>
                  <TableHead>Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.menuItem}>
                    <TableCell className="font-medium">{r.menuItem}</TableCell>
                    <TableCell>{r.branch}</TableCell>
                    <TableCell>{formatInr(r.sellingPrice)}</TableCell>
                    <TableCell>{formatInr(r.bomCost)}</TableCell>
                    <TableCell>
                      <Badge variant={r.foodCostPercent > 35 ? "destructive" : "success"}>
                        {formatPercent(r.foodCostPercent)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatInr(r.marginInr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );
    }
    case "inventory-variance": {
      const rows = getVarianceReport();
      return (
        <Card>
          <CardHeader>
            <CardTitle>Night variance — theoretical vs physical</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw Material</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Theoretical Qty</TableHead>
                  <TableHead>Physical Qty</TableHead>
                  <TableHead>Variance Value</TableHead>
                  <TableHead>Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.rawMaterial + r.branch}>
                    <TableCell className="font-medium">{r.rawMaterial}</TableCell>
                    <TableCell>{r.branch}</TableCell>
                    <TableCell>{r.theoreticalQty}</TableCell>
                    <TableCell>{r.physicalQty}</TableCell>
                    <TableCell className={r.varianceValueInr < 0 ? "text-destructive" : "text-success"}>
                      {formatInr(r.varianceValueInr)}
                    </TableCell>
                    <TableCell>
                      {r.flaggedPilferage ? <Badge variant="destructive">Pilferage?</Badge> : <Badge variant="secondary">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );
    }
    case "cash-reconciliation": {
      const rows = getCashReconciliation();
      return (
        <Card>
          <CardHeader>
            <CardTitle>Blind cash drop — shortage / excess</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Counted</TableHead>
                  <TableHead>Shortage/Excess</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.cashier}>
                    <TableCell className="font-medium">{r.cashier}</TableCell>
                    <TableCell>{r.branch}</TableCell>
                    <TableCell>{r.shiftDate}</TableCell>
                    <TableCell>{formatInr(r.expectedInr)}</TableCell>
                    <TableCell>{formatInr(r.countedInr)}</TableCell>
                    <TableCell className={r.shortageExcessInr < 0 ? "text-destructive" : "text-success"}>
                      {formatInr(r.shortageExcessInr)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );
    }
    case "aggregator-recon": {
      const rows = getAggregatorRecon();
      return (
        <Card>
          <CardHeader>
            <CardTitle>Swiggy/Zomato — order value vs net payout</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Order Value</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Ads</TableHead>
                  <TableHead>Refund Penalty</TableHead>
                  <TableHead>Net Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant={r.channel === "SWIGGY" ? "warning" : "destructive"}>{r.channel}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.branch}</TableCell>
                    <TableCell>{formatInr(r.orderValue)}</TableCell>
                    <TableCell>{formatInr(r.commissionAmount)}</TableCell>
                    <TableCell>{formatInr(r.adsAmount)}</TableCell>
                    <TableCell>{formatInr(r.refundPenalty)}</TableCell>
                    <TableCell className="font-medium">{formatInr(r.netPayout)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );
    }
    default:
      return null;
  }
}
