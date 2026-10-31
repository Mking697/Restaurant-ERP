"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { useCurrentUser } from "@/lib/current-user";
import { Field, inputClass, money, monthEnd, monthNow, Panel, post, query, today, useAction, useResource } from "../workforce/live-ui";

// Real DB-backed replacement for the old mock-data.ts tabs: Petty Cash Book,
// Aggregator Recon, Balance Sheet. Wired onto /api/accounts/petty-cash,
// /api/accounts/aggregator-orders, /api/accounts/balance-sheet. This file no
// longer imports from "@/lib/mock-data" and nothing here resets on reload —
// every write is a real HTTP POST persisted to Postgres.

type PettyCashEntry = { id: string; branchId: string; loggedById: string; entryType: "IN" | "OUT"; amount: string; description: string; photoUrl: string; dailyCapInr: string; balanceAfterInr: string; entryDate: string };
type PettyCashResponse = { entries: PettyCashEntry[]; currentBalance: string | null; month: string };
type AggregatorOrder = { id: string; branchId: string; channel: string; orderValue: string; commissionAmount: string; adsAmount: string; refundPenalty: string; netPayout: string; orderDate: string };
type AggregatorResponse = { orders: AggregatorOrder[]; totals: { orderValue: string; commissionAmount: string; adsAmount: string; refundPenalty: string; netPayout: string }; month: string };
type BalanceSheetRow = { id: string; code: string; name: string; type: string; amountInr: string };
type BalanceSheetResponse = { branchId: string; seeded: boolean; assets: BalanceSheetRow[]; liabilities: BalanceSheetRow[]; equity: BalanceSheetRow[]; totals: { asset: string; liability: string; equity: string }; balanced: boolean; notes: string[] };

export default function LegacyAccountsDemo({ petty, recon, balance }: { petty: boolean; recon: boolean; balance: boolean }) {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches } = useBranches();
  const [choice, setChoice] = React.useState("");
  const [month, setMonth] = React.useState(monthNow());
  const branchId = actor.role === "SUPER_ADMIN" ? (selected === "all" ? choice : selected) : actor.branchId ?? "";
  const validBranch = !!branchId && branchId !== "__no_branch__";

  return (
    <section className="space-y-3">
      <p role="note" className="rounded-md border border-emerald-500 p-3 text-sm">
        {uiText(
          "Real accounts data, saved to Postgres. Petty Cash and Aggregator Recon require their own branch grant; Balance Sheet is a real aggregation from the chart of accounts and journal entries, not a hardcoded figure.",
          "Real accounts data, Postgres mein saved. Petty Cash aur Aggregator Recon ke liye apna branch grant chahiye; Balance Sheet real aggregation hai chart of accounts aur journal entries se, hardcoded figure nahi."
        )}
      </p>

      {actor.role === "SUPER_ADMIN" && (
        <div className="grid max-w-sm gap-3">
          <Field label={uiText("Branch", "Branch")}>
            <select className={inputClass} value={validBranch ? branchId : ""} disabled={selected !== "all"} onChange={e => setChoice(e.target.value)}>
              <option value="">{uiText("Select one branch", "Ek branch chuno")}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
            </select>
          </Field>
        </div>
      )}

      <Tabs defaultValue={petty ? "petty-cash" : recon ? "aggregator" : "balance-sheet"}>
        <TabsList>
          {petty && <TabsTrigger value="petty-cash">{uiText("Petty Cash Book", "Petty Cash Book")}</TabsTrigger>}
          {recon && <TabsTrigger value="aggregator">{uiText("Aggregator Recon", "Aggregator Recon")}</TabsTrigger>}
          {balance && <TabsTrigger value="balance-sheet">{uiText("Balance Sheet", "Balance Sheet")}</TabsTrigger>}
        </TabsList>

        {petty && <TabsContent value="petty-cash">
          {validBranch ? <PettyCashPanel key={`${branchId}:${month}`} branchId={branchId} month={month} setMonth={setMonth} /> : <Panel><p>{uiText("Select a branch to view or log petty cash.", "Petty cash dekhne/log karne ke liye branch chuno.")}</p></Panel>}
        </TabsContent>}

        {recon && <TabsContent value="aggregator">
          {validBranch ? <AggregatorPanel key={`${branchId}:${month}`} branchId={branchId} month={month} setMonth={setMonth} /> : <Panel><p>{uiText("Select a branch to view or log aggregator settlements.", "Aggregator settlements dekhne/log karne ke liye branch chuno.")}</p></Panel>}
        </TabsContent>}

        {balance && <TabsContent value="balance-sheet">
          {validBranch ? <BalanceSheetPanel key={branchId} branchId={branchId} canSeed={actor.role === "SUPER_ADMIN"} /> : <Panel><p>{uiText("Select a branch to view the balance sheet.", "Balance sheet dekhne ke liye branch chuno.")}</p></Panel>}
        </TabsContent>}
      </Tabs>
    </section>
  );
}

function MonthField({ month, setMonth }: { month: string; setMonth: (value: string) => void }) {
  const uiText = useUiCopy();
  return <Field label={uiText("Month", "Mahina")}><input className={inputClass} type="month" required value={month} onChange={e => setMonth(e.target.value)} /></Field>;
}

function PettyCashPanel({ branchId, month, setMonth }: { branchId: string; month: string; setMonth: (value: string) => void }) {
  const uiText = useUiCopy();
  const resource = useResource<PettyCashResponse>(`/api/accounts/petty-cash?${query(branchId, { month })}`);
  const action = useAction();
  const blank = () => ({ entryType: "OUT" as "IN" | "OUT", amount: "", description: "", photoUrl: "" });
  const [entry, setEntry] = React.useState(blank);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      await post("/api/accounts/petty-cash", { branchId, ...entry });
      setEntry(blank());
      await resource.reload();
    }, uiText("Petty cash entry saved and reloaded from database.", "Petty cash entry save hui aur database se reload hui."));
  }

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="font-semibold">{uiText("Log petty cash entry", "Petty cash entry log karo")}</h2>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <fieldset disabled={action.busy} className="col-span-full grid gap-3 sm:grid-cols-2">
            <MonthField month={month} setMonth={setMonth} />
            <Field label={uiText("Type", "Type")}>
              <select className={inputClass} value={entry.entryType} onChange={e => setEntry({ ...entry, entryType: e.target.value as "IN" | "OUT" })}>
                <option value="OUT">{uiText("OUT (expense)", "OUT (expense)")}</option>
                <option value="IN">{uiText("IN (top-up / refund)", "IN (top-up / refund)")}</option>
              </select>
            </Field>
            <Field label={uiText("Amount (TSh)", "Amount (TSh)")}>
              <input className={inputClass} type="number" min="0.01" step="0.01" required value={entry.amount} onChange={e => setEntry({ ...entry, amount: e.target.value })} />
            </Field>
            <Field label={uiText("Description", "Vivaran")}>
              <input className={inputClass} required minLength={2} maxLength={500} value={entry.description} onChange={e => setEntry({ ...entry, description: e.target.value })} placeholder={uiText("Milk, cleaning supplies, refund...")} />
            </Field>
          </fieldset>
          <Button type="submit" disabled={action.busy || !entry.amount.trim() || !entry.description.trim()}>
            {action.busy ? uiText("Saving…", "Save ho raha hai…") : uiText("Log entry", "Entry log karo")}
          </Button>
        </form>
        {action.error && <p role="alert" className="text-destructive">{action.error}</p>}
        {action.message && <p role="status" className="text-success">{action.message}</p>}
      </Panel>
      <Panel>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{uiText("Ledger", "Ledger")}</h2>
          {resource.data?.currentBalance !== undefined && resource.data?.currentBalance !== null && <p className="font-medium">{uiText("Current balance:", "Current balance:")} {money(resource.data.currentBalance)}</p>}
        </div>
        {resource.loading && <p role="status">{uiText("Loading…", "Load ho raha hai…")}</p>}
        {resource.error && <p role="alert" className="text-destructive">{resource.error}</p>}
        {resource.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{uiText("Date")}</TableHead>
                <TableHead>{uiText("Type")}</TableHead>
                <TableHead>{uiText("Description")}</TableHead>
                <TableHead>{uiText("Amount")}</TableHead>
                <TableHead>{uiText("Balance After")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resource.data.entries.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm text-muted-foreground">{new Date(p.entryDate).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={p.entryType === "IN" ? "success" : "secondary"}>{p.entryType}</Badge></TableCell>
                  <TableCell>{p.description}</TableCell>
                  <TableCell className={p.entryType === "IN" ? "text-success" : "text-destructive"}>{p.entryType === "IN" ? "+" : "-"}{money(p.amount)}</TableCell>
                  <TableCell className="font-medium">{money(p.balanceAfterInr)}</TableCell>
                </TableRow>
              ))}
              {!resource.data.entries.length && <TableRow><TableCell colSpan={5}>{uiText("No petty cash entries in this month.", "Is mahine mein koi petty cash entry nahi hai.")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

function AggregatorPanel({ branchId, month, setMonth }: { branchId: string; month: string; setMonth: (value: string) => void }) {
  const uiText = useUiCopy();
  const resource = useResource<AggregatorResponse>(`/api/accounts/aggregator-orders?${query(branchId, { month })}`);
  const action = useAction();
  const blank = () => ({ channel: "SWIGGY" as "SWIGGY" | "ZOMATO", orderValue: "", commissionAmount: "", adsAmount: "", refundPenalty: "", orderDate: today() });
  const [entry, setEntry] = React.useState(blank);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      await post("/api/accounts/aggregator-orders", { branchId, ...entry });
      setEntry(blank());
      await resource.reload();
    }, uiText("Settlement saved and reloaded from database.", "Settlement save hua aur database se reload hua."));
  }

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="font-semibold">{uiText("Log aggregator settlement", "Aggregator settlement log karo")}</h2>
        <p className="text-sm text-muted-foreground">{uiText("Net payout is always computed on the server from order value minus commission, ads and refund/penalty — never a value you type in.", "Net payout hamesha server par calculate hota hai order value minus commission, ads aur refund/penalty se — kabhi aapka typed value nahi.")}</p>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <fieldset disabled={action.busy} className="col-span-full grid gap-3 sm:grid-cols-2">
            <MonthField month={month} setMonth={setMonth} />
            <Field label={uiText("Order date", "Order date")}>
              <input className={inputClass} type="date" required min={`${month}-01`} max={monthEnd(month)} value={entry.orderDate} onChange={e => setEntry({ ...entry, orderDate: e.target.value })} />
            </Field>
            <Field label={uiText("Channel", "Channel")}>
              <select className={inputClass} value={entry.channel} onChange={e => setEntry({ ...entry, channel: e.target.value as "SWIGGY" | "ZOMATO" })}>
                <option value="SWIGGY">SWIGGY</option>
                <option value="ZOMATO">ZOMATO</option>
              </select>
            </Field>
            <Field label={uiText("Order value (TSh)", "Order value (TSh)")}><input className={inputClass} type="number" min="0.01" step="0.01" required value={entry.orderValue} onChange={e => setEntry({ ...entry, orderValue: e.target.value })} /></Field>
            <Field label={uiText("Commission (TSh)", "Commission (TSh)")}><input className={inputClass} type="number" min="0" step="0.01" value={entry.commissionAmount} onChange={e => setEntry({ ...entry, commissionAmount: e.target.value })} /></Field>
            <Field label={uiText("Ads (TSh)", "Ads (TSh)")}><input className={inputClass} type="number" min="0" step="0.01" value={entry.adsAmount} onChange={e => setEntry({ ...entry, adsAmount: e.target.value })} /></Field>
            <Field label={uiText("Refund / penalty (TSh)", "Refund / penalty (TSh)")}><input className={inputClass} type="number" min="0" step="0.01" value={entry.refundPenalty} onChange={e => setEntry({ ...entry, refundPenalty: e.target.value })} /></Field>
          </fieldset>
          <Button type="submit" disabled={action.busy || !entry.orderValue.trim()}>
            {action.busy ? uiText("Saving…", "Save ho raha hai…") : uiText("Log settlement", "Settlement log karo")}
          </Button>
        </form>
        {action.error && <p role="alert" className="text-destructive">{action.error}</p>}
        {action.message && <p role="status" className="text-success">{action.message}</p>}
      </Panel>
      <Panel>
        <h2 className="font-semibold">{uiText("Settlements", "Settlements")}</h2>
        {resource.loading && <p role="status">{uiText("Loading…", "Load ho raha hai…")}</p>}
        {resource.error && <p role="alert" className="text-destructive">{resource.error}</p>}
        {resource.data && <>
          <div className="grid gap-2 sm:grid-cols-3">
            <p>{uiText("Order value total:", "Order value total:")} <strong>{money(resource.data.totals.orderValue)}</strong></p>
            <p>{uiText("Net payout total:", "Net payout total:")} <strong>{money(resource.data.totals.netPayout)}</strong></p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{uiText("Date")}</TableHead>
                <TableHead>{uiText("Channel")}</TableHead>
                <TableHead>{uiText("Order Value")}</TableHead>
                <TableHead>{uiText("Commission")}</TableHead>
                <TableHead>{uiText("Net Payout")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resource.data.orders.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="text-sm text-muted-foreground">{new Date(a.orderDate).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant={a.channel === "SWIGGY" ? "warning" : "destructive"}>{a.channel}</Badge></TableCell>
                  <TableCell>{money(a.orderValue)}</TableCell>
                  <TableCell>{money(a.commissionAmount)}</TableCell>
                  <TableCell className="font-medium">{money(a.netPayout)}</TableCell>
                </TableRow>
              ))}
              {!resource.data.orders.length && <TableRow><TableCell colSpan={5}>{uiText("No settlements in this month.", "Is mahine mein koi settlement nahi hai.")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </>}
      </Panel>
    </div>
  );
}

function BalanceSheetPanel({ branchId, canSeed }: { branchId: string; canSeed: boolean }) {
  const uiText = useUiCopy();
  const resource = useResource<BalanceSheetResponse>(`/api/accounts/balance-sheet?branchId=${encodeURIComponent(branchId)}`);
  const action = useAction();

  async function seed() {
    await action.run(async () => {
      await post("/api/accounts/balance-sheet", {});
      await resource.reload();
    }, uiText("Standard chart of accounts seeded.", "Standard chart of accounts seed hua."));
  }

  return (
    <div className="space-y-4">
      {resource.loading && <p role="status">{uiText("Loading…", "Load ho raha hai…")}</p>}
      {resource.error && <p role="alert" className="text-destructive">{resource.error}</p>}
      {resource.data && !resource.data.seeded && (
        <Panel>
          <p role="alert">{uiText("No ledger accounts exist yet — these are real zeros, not a fabricated balance.", "Abhi koi ledger account nahi hai — yeh real zeros hain, fabricated balance nahi.")}</p>
          {canSeed && <Button onClick={seed} disabled={action.busy}>{action.busy ? uiText("Seeding…", "Seed ho raha hai…") : uiText("Seed standard chart of accounts", "Standard chart of accounts seed karo")}</Button>}
          {action.error && <p role="alert" className="text-destructive">{action.error}</p>}
          {action.message && <p role="status" className="text-success">{action.message}</p>}
        </Panel>
      )}
      {resource.data && resource.data.seeded && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <BalanceSheetSection title={uiText("Assets", "Assets")} total={resource.data.totals.asset} rows={resource.data.assets} />
            <BalanceSheetSection title={uiText("Liabilities", "Liabilities")} total={resource.data.totals.liability} rows={resource.data.liabilities} />
            <BalanceSheetSection title={uiText("Equity", "Equity")} total={resource.data.totals.equity} rows={resource.data.equity} />
          </div>
          <p className={`mt-3 text-xs ${resource.data.balanced ? "text-muted-foreground" : "text-destructive"}`}>
            {uiText("Check: Assets (", "Check: Assets (")}{money(resource.data.totals.asset)}{uiText(") = Liabilities + Equity (", ") = Liabilities + Equity (")}{money(resource.data.totals.liability)} + {money(resource.data.totals.equity)}){resource.data.balanced ? "" : ` — ${uiText("NOT balanced", "balance nahi hai")}`}
          </p>
          {resource.data.notes.map((note, i) => <p key={i} className="text-xs text-muted-foreground">{note}</p>)}
        </>
      )}
    </div>
  );
}

function BalanceSheetSection({ title, total, rows }: { title: string; total: string; rows: BalanceSheetRow[] }) {
  const uiText = useUiCopy();
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.name}</span>
            <span className="font-medium">{money(r.amountInr)}</span>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">{uiText("None", "Koi nahi")}</p>}
        <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
          <span>{uiText("Total", "Total")}</span>
          <span>{money(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
