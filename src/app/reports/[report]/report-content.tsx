"use client";
import { useUiCopy } from "@/lib/ui-copy";
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

export default function ReportDetailContent({ slug }: { slug: ReportSlug }) {
  const uiText = useUiCopy();
  const def = REPORT_DEFS.find((r) => r.slug === slug)!;
  return <AppShell activeHref="/reports"><PageHeader title={uiText(def.title)} description={uiText(def.description)}><ExportButton filename={slug} rows={exportRowsFor(slug)} /></PageHeader><ReportBody slug={slug} /></AppShell>;
}

function ReportBody({ slug }: { slug: ReportSlug }) {
  const uiText = useUiCopy();
  switch (slug) {
    case "sales-trend": {
      const trend = getRevenueTrend14d();
      return (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{uiText("Revenue — last 14 days")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueTrendChart data={trend} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{uiText("Prime cost % trend")}</CardTitle>
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
              <CardTitle>{uiText("MIS score by person")}</CardTitle>
            </CardHeader>
            <CardContent>
              <MisLeaderboardChart data={rows.map((r) => ({ name: r.name, totalScore: r.totalScore }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{uiText("Breakdown")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiText("Name")}</TableHead>
                    <TableHead>{uiText("On Time")}</TableHead>
                    <TableHead>{uiText("Delay")}</TableHead>
                    <TableHead>{uiText("Not Done")}</TableHead>
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
            <CardTitle>{uiText("Food cost % + margin per menu item")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiText("Menu Item")}</TableHead>
                  <TableHead>{uiText("Branch")}</TableHead>
                  <TableHead>{uiText("Selling Price")}</TableHead>
                  <TableHead>{uiText("BOM Cost")}</TableHead>
                  <TableHead>{uiText("Food Cost %")}</TableHead>
                  <TableHead>{uiText("Margin")}</TableHead>
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
            <CardTitle>{uiText("Night variance — theoretical vs physical")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiText("Raw Material")}</TableHead>
                  <TableHead>{uiText("Branch")}</TableHead>
                  <TableHead>{uiText("Theoretical Qty")}</TableHead>
                  <TableHead>{uiText("Physical Qty")}</TableHead>
                  <TableHead>{uiText("Variance Value")}</TableHead>
                  <TableHead>{uiText("Flag")}</TableHead>
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
                      {r.flaggedPilferage ? <Badge variant="destructive">{uiText("Pilferage?")}</Badge> : <Badge variant="secondary">{uiText("OK")}</Badge>}
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
            <CardTitle>{uiText("Blind cash drop — shortage / excess")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiText("Cashier")}</TableHead>
                  <TableHead>{uiText("Branch")}</TableHead>
                  <TableHead>{uiText("Shift")}</TableHead>
                  <TableHead>{uiText("Expected")}</TableHead>
                  <TableHead>{uiText("Counted")}</TableHead>
                  <TableHead>{uiText("Shortage/Excess")}</TableHead>
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
            <CardTitle>{uiText("Swiggy/Zomato — order value vs net payout")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiText("Channel")}</TableHead>
                  <TableHead>{uiText("Branch")}</TableHead>
                  <TableHead>{uiText("Order Value")}</TableHead>
                  <TableHead>{uiText("Commission")}</TableHead>
                  <TableHead>{uiText("Ads")}</TableHead>
                  <TableHead>{uiText("Refund Penalty")}</TableHead>
                  <TableHead>{uiText("Net Payout")}</TableHead>
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
