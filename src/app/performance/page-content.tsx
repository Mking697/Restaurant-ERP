"use client";
import { useUiCopy } from "@/lib/ui-copy";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MisLeaderboardChart } from "@/components/charts/charts";
import { getMisLeaderboard } from "@/lib/mock-data";
import { formatPercent } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv-export";
import { Download } from "lucide-react";

export default function PerformancePage() {
  const uiText = useUiCopy();
  const rows = [...getMisLeaderboard()].sort((a, b) => b.totalScore - a.totalScore);

  function exportCsv() {
    downloadCsv(
      "mis-leaderboard",
      rows.map((r) => ({
        Name: r.name,
        Role: r.role,
        Branch: r.branch,
        OnTime: r.onTimeCount,
        Delay: r.delayCount,
        NotDone: r.notDoneCount,
        MisScore: r.totalScore,
      }))
    );
  }

  return (
    <AppShell activeHref="/performance">
      <PageHeader
        title={uiText("Team Performance — MIS Leaderboard")}
        description={uiText("MIS score timestamps se calculate hota hai. 100% sabse achha — late aur chhoote hue tasks penalty banate hain.")}
      >
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download /> {uiText(" Export CSV ")}</Button>
      </PageHeader>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{uiText("Score by person")}</CardTitle>
          <CardDescription>{uiText("40% task / 30% delegation / 20% variance / 10% cashier weighted score")}</CardDescription>
        </CardHeader>
        <CardContent>
          <MisLeaderboardChart data={rows.map((r) => ({ name: r.name, totalScore: r.totalScore }))} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{uiText("Rank")}</TableHead>
                <TableHead>{uiText("Name")}</TableHead>
                <TableHead>{uiText("Role")}</TableHead>
                <TableHead>{uiText("Branch")}</TableHead>
                <TableHead className="text-center">{uiText("On Time")}</TableHead>
                <TableHead className="text-center">{uiText("Delay")}</TableHead>
                <TableHead className="text-center">{uiText("Not Done")}</TableHead>
                <TableHead className="text-right">{uiText("MIS Score")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">#{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.role.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell>{r.branch}</TableCell>
                  <TableCell className="text-center">{r.onTimeCount}</TableCell>
                  <TableCell className="text-center">{r.delayCount}</TableCell>
                  <TableCell className="text-center">{r.notDoneCount}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.totalScore >= 85 ? "success" : r.totalScore >= 70 ? "warning" : "destructive"}>
                      {formatPercent(r.totalScore)}
                    </Badge>
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
