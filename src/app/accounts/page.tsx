"use client";

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
  getProfitLoss,
  type PettyCashRow,
} from "@/lib/mock-data";
import { formatInr } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function AccountsPage() {
  const [pettyCash, setPettyCash] = React.useState<PettyCashRow[]>(getPettyCash());
  const [aggregator] = React.useState(getAggregatorRecon());
  const [balanceSheet] = React.useState(getBalanceSheet());
  const [pnl] = React.useState(getProfitLoss());
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
    notify(`Petty cash ${entry.entryType === "IN" ? "top-up" : "expense"} logged — new balance ${formatInr(newBalance)}`);
    setEntry({ branch: "", entryType: "OUT", description: "", amountInr: "" });
    setEntryOpen(false);
  }

  const assetTotal = balanceSheet.filter((r) => r.section === "ASSET").reduce((s, r) => s + r.amountInr, 0);
  const liabilityTotal = balanceSheet.filter((r) => r.section === "LIABILITY").reduce((s, r) => s + r.amountInr, 0);
  const equityTotal = balanceSheet.filter((r) => r.section === "EQUITY").reduce((s, r) => s + r.amountInr, 0);

  return (
    <AppShell activeHref="/accounts">
      <PageHeader
        title="Accounts"
        description="Petty cash book, aggregator reconciliation, Profit & Loss, Balance Sheet — ek hi jagah."
      >
        <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> Petty Cash Entry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Petty Cash Entry</DialogTitle>
              <DialogDescription>IN = HQ top-up ya refund credit. OUT = branch expense. Running balance auto-update hoga.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Branch">
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={entry.branch}
                  onChange={(e) => setEntry({ ...entry, branch: e.target.value })}
                  placeholder="Connaught Place"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={entry.entryType}
                    onChange={(e) => setEntry({ ...entry, entryType: e.target.value as "IN" | "OUT" })}
                  >
                    <option value="OUT">OUT (expense)</option>
                    <option value="IN">IN (top-up / refund)</option>
                  </select>
                </Field>
                <Field label="Amount (₹)">
                  <input
                    type="number"
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                    value={entry.amountInr}
                    onChange={(e) => setEntry({ ...entry, amountInr: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Description">
                <input
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                  value={entry.description}
                  onChange={(e) => setEntry({ ...entry, description: e.target.value })}
                  placeholder="Milk, cleaning supplies, refund..."
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEntryOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addEntry} disabled={!entry.branch.trim() || !entry.description.trim() || !entry.amountInr.trim()}>
                Log Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Tabs defaultValue="petty-cash">
        <TabsList>
          <TabsTrigger value="petty-cash">Petty Cash Book</TabsTrigger>
          <TabsTrigger value="aggregator">Aggregator Recon</TabsTrigger>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="petty-cash">
          <Card>
            <CardContent className="pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Logged By</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Balance After</TableHead>
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
          </Card>
        </TabsContent>

        <TabsContent value="aggregator">
          <Card>
            <CardContent className="pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Order Value</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Net Payout</TableHead>
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
          </Card>
        </TabsContent>

        <TabsContent value="pnl">
          <Card>
            <CardHeader>
              <CardTitle>Profit &amp; Loss — all branches compiled</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  {pnl.map((row) => (
                    <TableRow key={row.label} className={row.isTotal ? "bg-muted/50 font-semibold" : ""}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className={`text-right ${row.amountInr < 0 ? "text-destructive" : ""}`}>
                        {formatInr(row.amountInr)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance-sheet">
          <div className="grid gap-4 lg:grid-cols-3">
            <BalanceSheetSection title="Assets" total={assetTotal} rows={balanceSheet.filter((r) => r.section === "ASSET")} />
            <BalanceSheetSection
              title="Liabilities"
              total={liabilityTotal}
              rows={balanceSheet.filter((r) => r.section === "LIABILITY")}
            />
            <BalanceSheetSection title="Equity" total={equityTotal} rows={balanceSheet.filter((r) => r.section === "EQUITY")} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Check: Assets ({formatInr(assetTotal)}) = Liabilities + Equity ({formatInr(liabilityTotal + equityTotal)})
          </p>
        </TabsContent>
      </Tabs>
      <ToastHost />
    </AppShell>
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
          <span>Total</span>
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
