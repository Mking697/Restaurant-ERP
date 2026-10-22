"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  getPettyCash,
  getAggregatorRecon,
  getBalanceSheet,
  type PettyCashRow,
} from "@/lib/mock-data";
import { formatInr } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function LegacyAccountsDemo({ petty, recon, balance }: { petty: boolean; recon: boolean; balance: boolean }) {
  const uiText = useUiCopy();
  const [pettyCash, setPettyCash] = React.useState<PettyCashRow[]>(getPettyCash());
  const [aggregator] = React.useState(getAggregatorRecon());
  const [balanceSheet] = React.useState(getBalanceSheet());
  const [entryOpen, setEntryOpen] = React.useState(false);
  const { notify, ToastHost } = useToast();

  const [entry, setEntry] = React.useState({
    branch: "",
    entryType: "OUT" as "IN" | "OUT",
    description: "",
    amountInr: "",
  });

  const branchBalances = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of pettyCash) map.set(e.branch, e.balanceAfterInr);
    return map;
  }, [pettyCash]);

  function addEntry() {
    if (!entry.branch.trim() || !entry.description.trim() || !entry.amountInr.trim()) return;
    const amount = Number(entry.amountInr) || 0;
    const prevBalance = branchBalances.get(entry.branch.trim()) ?? 0;
    const newBalance = entry.entryType === "IN" ? prevBalance + amount : prevBalance - amount;
    setPettyCash((prev) => [
      {
        id: `pc${prev.length + 1}-${Date.now()}`,
        branch: entry.branch.trim(),
        loggedBy: "You",
        entryType: entry.entryType,
        description: entry.description.trim(),
        amountInr: amount,
        dailyCapInr: 2000,
        balanceAfterInr: newBalance,
        entryDate: "Just now",
      },
      ...prev,
    ]);
    notify(uiText(`Demo cash entry added — page balance ${formatInr(newBalance)}. Not saved to database.`, `Demo cash entry jodi — page balance ${formatInr(newBalance)}. Database mein save nahi hui.`));
    setEntry({ branch: "", entryType: "OUT", description: "", amountInr: "" });
    setEntryOpen(false);
  }

  const assetTotal = balanceSheet.filter((r) => r.section === "ASSET").reduce((s, r) => s + r.amountInr, 0);
  const liabilityTotal = balanceSheet.filter((r) => r.section === "LIABILITY").reduce((s, r) => s + r.amountInr, 0);
  const equityTotal = balanceSheet.filter((r) => r.section === "EQUITY").reduce((s, r) => s + r.amountInr, 0);

  return (
    <section className="space-y-3">
      <p role="note" className="rounded-md border border-amber-500 p-3">{uiText("Interactive demo only — sample data. Changes reset on reload and never affect saved expenses or payroll.", "Sirf interactive demo — sample data. Reload par changes reset honge; saved expenses ya payroll par asar nahi.")}</p>
      <PageHeader
        title={uiText("Legacy demonstrations", "Purane demos")}
        description={uiText("Not connected to database.", "Database se connected nahi.")}
      >
        {petty && <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> {uiText(" Petty Cash Entry ")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{uiText("Petty Cash Entry")}</DialogTitle>
              <DialogDescription>{uiText("IN = HQ top-up ya refund credit. OUT = branch expense. Running balance auto-update hoga.")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label={uiText("Branch")}>
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={entry.branch}
                  onChange={(e) => setEntry({ ...entry, branch: e.target.value })}
                  placeholder={uiText("Connaught Place")}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={uiText("Type")}>
                  <select
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={entry.entryType}
                    onChange={(e) => setEntry({ ...entry, entryType: e.target.value as "IN" | "OUT" })}
                  >
                    <option value="OUT">{uiText("OUT (expense)")}</option>
                    <option value="IN">{uiText("IN (top-up / refund)")}</option>
                  </select>
                </Field>
                <Field label={uiText("Amount (₹)")}>
                  <input
                    type="number"
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={entry.amountInr}
                    onChange={(e) => setEntry({ ...entry, amountInr: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={uiText("Description")}>
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={entry.description}
                  onChange={(e) => setEntry({ ...entry, description: e.target.value })}
                  placeholder={uiText("Milk, cleaning supplies, refund...")}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEntryOpen(false)}>
                {uiText(" Cancel ")}</Button>
              <Button onClick={addEntry} disabled={!entry.branch.trim() || !entry.description.trim() || !entry.amountInr.trim()}>
                {uiText(" Log Entry ")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>}
      </PageHeader>

      <Tabs defaultValue={petty ? "petty-cash" : recon ? "aggregator" : "balance-sheet"}>
        <TabsList>
          {petty && <TabsTrigger value="petty-cash">{uiText("Petty Cash Book · Demo", "Petty Cash Book · Demo")}</TabsTrigger>}
          {recon && <TabsTrigger value="aggregator">{uiText("Aggregator Recon · Demo", "Aggregator Recon · Demo")}</TabsTrigger>}
          {balance && <TabsTrigger value="balance-sheet">{uiText("Balance Sheet · Demo", "Balance Sheet · Demo")}</TabsTrigger>}
        </TabsList>

        {petty && <TabsContent value="petty-cash">
          <Card>
            <CardContent className="pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiText("Date")}</TableHead>
                    <TableHead>{uiText("Branch")}</TableHead>
                    <TableHead>{uiText("Logged By")}</TableHead>
                    <TableHead>{uiText("Type")}</TableHead>
                    <TableHead>{uiText("Description")}</TableHead>
                    <TableHead>{uiText("Amount")}</TableHead>
                    <TableHead>{uiText("Balance After")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pettyCash.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm text-muted-foreground">{p.entryDate}</TableCell>
                      <TableCell className="font-medium">{p.branch}</TableCell>
                      <TableCell>{p.loggedBy}</TableCell>
                      <TableCell>
                        <Badge variant={p.entryType === "IN" ? "success" : "secondary"}>{p.entryType}</Badge>
                      </TableCell>
                      <TableCell>{p.description}</TableCell>
                      <TableCell className={p.entryType === "IN" ? "text-success" : "text-destructive"}>
                        {p.entryType === "IN" ? "+" : "-"}
                        {formatInr(p.amountInr)}
                      </TableCell>
                      <TableCell className="font-medium">{formatInr(p.balanceAfterInr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>        </TabsContent>}

        {recon && <TabsContent value="aggregator">
          <Card>
            <CardContent className="pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiText("Channel")}</TableHead>
                    <TableHead>{uiText("Branch")}</TableHead>
                    <TableHead>{uiText("Order Value")}</TableHead>
                    <TableHead>{uiText("Commission")}</TableHead>
                    <TableHead>{uiText("Net Payout")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregator.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant={a.channel === "SWIGGY" ? "warning" : "destructive"}>{a.channel}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{a.branch}</TableCell>
                      <TableCell>{formatInr(a.orderValue)}</TableCell>
                      <TableCell>{formatInr(a.commissionAmount)}</TableCell>
                      <TableCell className="font-medium">{formatInr(a.netPayout)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>        </TabsContent>}

        {balance && <TabsContent value="balance-sheet">
          <div className="grid gap-4 lg:grid-cols-3">
            <BalanceSheetSection title={uiText("Assets")} total={assetTotal} rows={balanceSheet.filter((r) => r.section === "ASSET")} />
            <BalanceSheetSection
              title={uiText("Liabilities")}
              total={liabilityTotal}
              rows={balanceSheet.filter((r) => r.section === "LIABILITY")}
            />
            <BalanceSheetSection title={uiText("Equity")} total={equityTotal} rows={balanceSheet.filter((r) => r.section === "EQUITY")} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {uiText(" Check: Assets (")}{formatInr(assetTotal)}{uiText(") = Liabilities + Equity (")}{formatInr(liabilityTotal + equityTotal)})
          </p>        </TabsContent>}
      </Tabs>
      <ToastHost />
    </section>
  );
}

function BalanceSheetSection({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: { accountName: string; amountInr: number }[];
}) {
  const uiText = useUiCopy();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.accountName} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.accountName}</span>
            <span className="font-medium">{formatInr(r.amountInr)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
          <span>{uiText("Total")}</span>
          <span>{formatInr(total)}</span>
        </div>
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