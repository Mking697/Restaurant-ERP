"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { useTranslation } from "@/lib/i18n";
import { downloadCsv } from "@/lib/csv-export";
import { Download } from "lucide-react";
import { ActionState, DataTable, Field, inputClass, LoadState, money, monthEnd, monthNow, Panel, post, query, today, useAction, useResource } from "../workforce/live-ui";
import LegacyAccountsDemo from "./legacy-demos";
import { createExpenseAttempt } from "@/lib/expense-attempt";
import { formatCurrency } from "@/lib/utils";
import { VendorReturnsPanel } from "@/components/vendor-returns-panel";

type Category = "RENT" | "UTILITIES" | "MARKETING" | "OTHER";
const categories: Category[] = ["RENT", "UTILITIES", "MARKETING", "OTHER"];
type Expense = { id: string; date: string; category: Category; subcategory: string | null; amount: string; description: string; reference: string | null; status: string; voidReason?: string | null };
type Expenses = { expenses: Expense[]; totals: Record<Category, string> };
type ProfitLoss = { expenses: Record<Category, string>; laborCost: string; totalOperatingExpenses: string; revenue: string; cogs: null; grossProfit: null; netProfit: string; salesConnected: true; notes: string[] };
export default function AccountsPage() {
  const actor = useCurrentUser(); const selected = useSelectedBranchId();
  const identity = `${actor.id}:${actor.authenticated}:${actor.role}:${actor.branchId}:${actor.moduleAccess.join(",")}:${selected}`;
  return <AppShell activeHref="/accounts"><AccountsScope key={identity} selected={selected} /></AppShell>;
}
function AccountsScope({ selected }: { selected: string }) {
  const { t } = useTranslation(); const actor = useCurrentUser(); const { branches, error } = useBranches();
  const [choice, setChoice] = React.useState(""); const [month, setMonth] = React.useState(monthNow);
  const branchId = actor.role === "SUPER_ADMIN" ? (selected === "all" ? choice : selected) : actor.branchId ?? "";
  const validBranch = !!branchId && branchId !== "__no_branch__";
  const allowed = hasCurrentModule(actor, "ACCOUNTS_EXPENSES");
  const petty = hasCurrentModule(actor, "PETTY_CASH"); const recon = hasCurrentModule(actor, "AGGREGATOR_RECON");
  const pnl = hasCurrentModule(actor, "ACCOUNTS_EXPENSES", "PAYROLL");
  const gstr = hasCurrentModule(actor, "OFFICIAL_SALES_REPORTS");
  const refunds = hasCurrentModule(actor, "VENDOR_REFUNDS");
  const any = pnl || petty || recon || gstr || refunds;
  return <><PageHeader title={t("Accounts", "Accounts")} description={t("Saved expenses, finalized payroll costs and expected refund/credit claims (not money received). Demonstration tabs remain labelled separately.", "Saved expenses, final payroll costs aur expected refund/credit claims (paisa receive nahi hua). Demo tabs alag label kiye gaye hain.")} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!any ? <p role="alert">{t("Accounts permission is required.", "Accounts permission chahiye.")}</p> : <>
      {pnl && <div className="mb-4 grid max-w-xl gap-3 sm:grid-cols-2"><Field label={t("Branch", "Branch")}><select className={inputClass} value={validBranch ? branchId : ""} disabled={actor.role !== "SUPER_ADMIN" || selected !== "all"} onChange={e => setChoice(e.target.value)}><option value="">{t("Select one branch", "Ek branch chuno")}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field><Field label={t("Month", "Mahina")}><input className={inputClass} type="month" required value={month} onChange={e => setMonth(e.target.value)} /></Field></div>}
      <Tabs defaultValue={allowed ? "expenses" : pnl ? "pnl" : gstr ? "gstr" : refunds ? "vendor-refunds" : "demos"}><TabsList className="h-auto flex-wrap justify-start">{refunds && <TabsTrigger value="vendor-refunds">{t("Vendor refunds", "Vendor refunds")}</TabsTrigger>}{allowed && <TabsTrigger value="expenses">{t("Expenses", "Kharche")}</TabsTrigger>}{pnl && <TabsTrigger value="pnl">{t("Profit & Loss", "Profit & Loss")}</TabsTrigger>}{gstr && <TabsTrigger value="gstr">{t("GSTR Export", "GSTR Export")}</TabsTrigger>}{(petty || recon) && <TabsTrigger value="demos">{t("Other accounts · Demo", "Baaki accounts · Demo")}</TabsTrigger>}</TabsList>
        {allowed && <TabsContent value="expenses">{validBranch && month ? <ExpensePanel key={`${branchId}:${month}`} branchId={branchId} month={month} /> : <Panel>{t("Select a branch and month to view or post real expenses.", "Real expenses dekhne ya save karne ke liye branch aur mahina chuno.")}</Panel>}</TabsContent>}{pnl && <TabsContent value="pnl">{validBranch && month ? <ProfitLossPanel key={`${branchId}:${month}`} branchId={branchId} month={month} /> : <Panel>{t("Select a branch and month.", "Branch aur mahina chuno.")}</Panel>}</TabsContent>}
        {refunds && <TabsContent value="vendor-refunds"><VendorReturnsPanel mode="accounts" /></TabsContent>}
        {gstr && <TabsContent value="gstr"><GstrExportPanel selectedBranchId={selected} /></TabsContent>}
        {(petty || recon) && <TabsContent value="demos"><LegacyAccountsDemo petty={petty} recon={recon} balance={petty || recon} /></TabsContent>}
      </Tabs>
    </>}
  </>;
}
function ExpensePanel({ branchId, month }: { branchId: string; month: string }) {
  const { t } = useTranslation(); const resource = useResource<Expenses>(`/api/accounts/expenses?${query(branchId, {month})}`); const action = useAction();
  const blank = () => ({ date: month === monthNow() ? today() : `${month}-01`, category: "OTHER" as Category, subcategory: "", amount: "", description: "", reference: "" });
  const actor = useCurrentUser();
  const [attempt] = React.useState(() => createExpenseAttempt(() => window.sessionStorage, { actorId: actor.id, branchId, month }));
  const [entry, setEntry] = React.useState(blank);
  const [pendingKey, setPendingKey] = React.useState<string | null>(null); const attempted = pendingKey !== null;
  const [storageError, setStorageError] = React.useState(""); const [ready, setReady] = React.useState(false);
  const [voidId, setVoidId] = React.useState(""); const [reason, setReason] = React.useState("");
  function restoreAttempt() {
    try { const pending = attempt.read(); setPendingKey(pending?.idempotencyKey ?? null); if (pending) setEntry(pending); setStorageError(""); setReady(true); }
    catch { setStorageError(t("Expense recovery storage is unavailable or damaged. Posting is blocked; do not clear browser data while an earlier expense may be unresolved.", "Expense recovery storage unavailable ya damaged hai. Posting blocked hai; unresolved expense ho toh browser data clear mat karo.")); setReady(false); }
  }
  React.useEffect(restoreAttempt, [attempt]);
  function change(field: string, value: string) { if (!attempted) setEntry(old => ({...old, [field]:value})); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!ready || storageError) return;
    await action.run(async () => {
      try { await attempt.submit(entry, payload => post("/api/accounts/expenses", payload), pendingKey); setEntry(blank()); }
      finally { restoreAttempt(); }
      await resource.reload();
    }, t("Expense saved and reloaded from database.", "Expense save hua aur database se reload hua."));
  }
  return <div className="space-y-4"><Panel><h2 className="font-semibold">{t("Post expense", "Kharcha save karo")}</h2><p className="text-sm text-muted-foreground">{t("Posted entries cannot be edited. Void with a reason to exclude an incorrect entry; the original audit record remains.", "Saved entry edit nahi hoti. Galat entry ko reason ke saath void karo; original audit record rahega.")}</p>
    {storageError && <p role="alert" className="text-destructive">{storageError}</p>}
    <form onSubmit={save}><fieldset disabled={action.busy || !ready || !!storageError} className="grid gap-3 sm:grid-cols-2">
      <Field label={t("Date", "Tareekh")}><input className={inputClass} required type="date" min={`${month}-01`} max={monthEnd(month)} value={entry.date} readOnly={attempted} onChange={e => change("date",e.target.value)} /></Field>
      <Field label={t("Category", "Category")}><select className={inputClass} disabled={attempted} value={entry.category} onChange={e => change("category",e.target.value)}>{categories.map(c => <option key={c} value={c}>{categoryLabel(c,t)}</option>)}</select></Field>
      <Field label={t("Subcategory", "Subcategory")}><input className={inputClass} maxLength={80} readOnly={attempted} value={entry.subcategory} onChange={e => change("subcategory",e.target.value)} /></Field>
      <Field label={t("Amount (INR)", "Amount (INR)")}><input className={inputClass} type="number" min="0.01" max="999999999.99" step="0.01" required readOnly={attempted} value={entry.amount} onChange={e => change("amount",e.target.value)} /></Field>
      <Field label={t("Description", "Vivaran")}><input className={inputClass} required minLength={3} maxLength={500} readOnly={attempted} value={entry.description} onChange={e => change("description",e.target.value)} /></Field>
      <Field label={t("Reference", "Reference")}><input className={inputClass} required minLength={2} maxLength={120} readOnly={attempted} value={entry.reference} onChange={e => change("reference",e.target.value)} /></Field>
      <Button type="submit">{action.busy ? t("Saving…", "Save ho raha hai…") : attempted ? t("Retry same expense", "Wahi expense retry karo") : t("Save expense", "Expense save karo")}</Button>
      {attempted && <p role="status">{t("Outcome unresolved. The exact expense and retry key are retained in this browser tab's session. Check saved records before retrying; do not clear browser data.", "Outcome unresolved hai. Wahi expense aur retry key is browser tab ke session mein retained hain. Retry se pehle saved records check karo; browser data clear mat karo.")}</p>}
    </fieldset></form><ActionState action={action} /></Panel>
    <Panel><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{t("Saved expenses", "Saved kharche")}</h2><Button variant="outline" disabled={resource.loading || action.busy} onClick={() => void resource.reload().catch(() => {})}>{t("Reload", "Reload karo")}</Button></div><LoadState {...resource} empty={!resource.data?.expenses.length} />
      {resource.data && <><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{categories.map(c => <p key={c}>{categoryLabel(c,t)}: <strong>{money(resource.data!.totals[c])}</strong></p>)}</div><DataTable headers={[t("Date", "Tareekh"), t("Category", "Category"), t("Description / reference", "Vivaran / reference"), t("Amount", "Amount"), t("Status", "Status"), t("Action", "Action")]}>{resource.data.expenses.map(row => <tr key={row.id}><td>{row.date}</td><td>{categoryLabel(row.category,t)}<p>{row.subcategory}</p></td><td className="min-w-40">{row.description}<p className="text-muted-foreground">{row.reference}</p></td><td className="whitespace-nowrap">{money(row.amount)}</td><td>{row.status}{row.voidReason && <p>{row.voidReason}</p>}</td><td>{row.status === "POSTED" && <Button variant="outline" disabled={action.busy} onClick={() => {setVoidId(row.id); setReason("");}}>{t("Void", "Void karo")}</Button>}</td></tr>)}</DataTable></>}
      {voidId && <form className="space-y-3 rounded-md border p-3" onSubmit={async e => {e.preventDefault(); if (await action.run(async () => { await post(`/api/accounts/expenses/${encodeURIComponent(voidId)}/void`, {reason}); await resource.reload(); }, t("Expense voided and reloaded.", "Expense void hua aur reload hua."))) {setVoidId(""); setReason("");} }}><fieldset disabled={action.busy} className="space-y-3"><p>{t("Void retains the original audit record and cannot be undone.", "Void mein original audit record rahega; ise undo nahi kar sakte.")}</p><Field label={t("Void reason", "Void ka reason")}><input className={inputClass} required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></Field><div className="flex gap-2"><Button type="submit" variant="destructive">{t("Confirm void", "Void confirm karo")}</Button><Button type="button" variant="outline" onClick={() => setVoidId("")}>{t("Cancel", "Cancel karo")}</Button></div></fieldset></form>}
    </Panel></div>;
}
function ProfitLossPanel({ branchId, month }: {branchId:string;month:string}) {
  const { t } = useTranslation(); const resource = useResource<ProfitLoss>(`/api/accounts/profit-loss?${query(branchId,{month})}`);
  return <Panel><h2 className="font-semibold">{t("Operating costs · not a complete P&L", "Operating costs · poora P&L nahi")}</h2><p>{t("Revenue is connected from real completed POS sales. COGS and gross profit remain unavailable — current-recipe/rate food cost is an estimate, never substituted as historical posted COGS. Only posted expenses and FINAL payroll snapshots are included; draft payroll is excluded.", "Revenue real completed POS sales se connected hai. COGS aur gross profit available nahi hain — current-recipe/rate food cost ek estimate hai, historical posted COGS ki jagah kabhi nahi use hota. Sirf posted expenses aur FINAL payroll snapshots shamil hain; draft payroll shamil nahi.")}</p><LoadState {...resource} />{resource.data && <><DataTable headers={[t("Line", "Line"),t("Amount", "Amount")]}>{categories.map(c => <tr key={c}><td>{categoryLabel(c,t)}</td><td>{money(resource.data!.expenses[c])}</td></tr>)}<tr><td>{t("Labor · finalized payroll only", "Labor · sirf final payroll")}</td><td>{money(resource.data.laborCost)}</td></tr><tr className="font-semibold"><td>{t("Total operating expenses", "Kul operating kharche")}</td><td>{money(resource.data.totalOperatingExpenses)}</td></tr><tr><td>{t("Revenue (real, completed POS sales)", "Revenue (real, completed POS sales)")}</td><td>{formatCurrency(resource.data.revenue)}</td></tr><tr><td>{t("Cost of goods sold", "Bikri ki lagat")}</td><td>{t("Unavailable — not historical COGS", "Available nahi — historical COGS nahi")}</td></tr><tr><td>{t("Gross profit", "Gross profit")}</td><td>{t("Unavailable (depends on COGS)", "Available nahi (COGS par depend)")}</td></tr><tr className="font-semibold"><td>{t("Net profit — revenue minus operating expenses (before COGS)", "Net profit — revenue minus operating expenses (COGS se pehle)")}</td><td>{formatCurrency(resource.data.netProfit)}</td></tr></DataTable>{resource.data.notes.map((note,i) => <p key={i} className="text-sm text-muted-foreground">{note}</p>)}</>}</Panel>;
}
function categoryLabel(category: Category, t: (en:string, hi?:string) => string) { return ({RENT:t("Rent", "Kiraya"),UTILITIES:t("Utilities", "Bijli / paani"),MARKETING:t("Marketing", "Marketing"),OTHER:t("Other", "Anya")})[category]; }

interface HsnRow { hsnSacCode: string; ratePercent: string; totalQty: number; taxableValue: string; cgst: string; sgst: string; igst: string; totalTax: string; totalValue: string; }
interface SummaryResponse { rows: HsnRow[]; grandTaxableValue: string; grandTotalTax: string; grandTotalValue: string; ordersIncluded: number; ordersExcludedNoGst: number; }
function gstrToday() { return new Date().toISOString().slice(0, 10); }
function gstrFirstOfMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }
function GstrExportPanel({ selectedBranchId }: { selectedBranchId: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = React.useState(gstrFirstOfMonth());
  const [to, setTo] = React.useState(gstrToday());
  const [data, setData] = React.useState<SummaryResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true); setError(""); setData(null);
    try {
      const url = `/api/gst/gstr1-hsn-summary?from=${from}&to=${to}` + (selectedBranchId !== "all" ? `&branchId=${encodeURIComponent(selectedBranchId)}` : "");
      const result = await requestJson<SummaryResponse>(url);
      setData(result);
    } catch (err) { setError(err instanceof Error ? err.message : "Load failed"); }
    finally { setLoading(false); }
  }
  React.useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function exportCsv() {
    if (!data?.rows.length) return;
    downloadCsv(`gstr1-hsn-summary-${from}-to-${to}.csv`, data.rows.map((r) => ({
      "HSN/SAC": r.hsnSacCode, "Rate %": r.ratePercent, "Total Qty": r.totalQty, "Taxable Value": r.taxableValue, CGST: r.cgst, SGST: r.sgst, IGST: r.igst, "Total Tax": r.totalTax, "Total Value": r.totalValue,
    })));
  }

  const inputClassGstr = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{t("Official HSN-wise summary from all eligible completed orders, including Owner-only orders. This is an unfiltered accounting view, not staff-visible sales. OFFICIAL_SALES_REPORTS permission is required.", "Sabhi eligible completed orders ka official HSN summary, Owner-only orders bhi included hain. Yeh unfiltered accounting view hai, staff-visible sales nahi. OFFICIAL_SALES_REPORTS permission chahiye.")}</p>
      <Button size="sm" variant="outline" disabled={!data?.rows.length} onClick={exportCsv}><Download className="size-4" /> {t("Export CSV", "Export CSV")}</Button>
    </div>
    <Card><CardContent className="flex flex-wrap items-end gap-3 pt-5">
      <label className="block space-y-1 text-xs font-medium"><span>{t("From", "From")}</span><input type="date" className={inputClassGstr} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="block space-y-1 text-xs font-medium"><span>{t("To", "To")}</span><input type="date" className={inputClassGstr} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <Button size="sm" disabled={loading} onClick={load}>{loading ? t("Loading…", "Load ho raha hai…") : t("Generate", "Generate")}</Button>
    </CardContent></Card>

    {error && <p role="alert" className="text-destructive">{t(error)}</p>}

    {data && <>
      {data.ordersExcludedNoGst > 0 && <p role="alert" className="text-sm text-destructive">{t(`${data.ordersExcludedNoGst} order(s) in this range are EXCLUDED — their branch or company GST state code isn't configured yet, so they can't be part of a GST filing.`)}</p>}
      <p className="text-sm text-muted-foreground">{t(`${data.ordersIncluded} GST-compliant order(s) included in this summary.`)}</p>
      <Card><CardContent className="pt-5">
        <Table><TableHeader><TableRow><TableHead>{t("HSN/SAC", "HSN/SAC")}</TableHead><TableHead>{t("Rate %", "Rate %")}</TableHead><TableHead>{t("Qty", "Qty")}</TableHead><TableHead>{t("Taxable Value", "Taxable Value")}</TableHead><TableHead>{t("CGST", "CGST")}</TableHead><TableHead>{t("SGST", "SGST")}</TableHead><TableHead>{t("IGST", "IGST")}</TableHead><TableHead>{t("Total Tax", "Total Tax")}</TableHead><TableHead>{t("Total Value", "Total Value")}</TableHead></TableRow></TableHeader><TableBody>
          {data.rows.map((r, i) => <TableRow key={i}>
            <TableCell className="font-medium">{r.hsnSacCode}</TableCell>
            <TableCell>{r.ratePercent}%</TableCell>
            <TableCell>{r.totalQty}</TableCell>
            <TableCell>₹{r.taxableValue}</TableCell>
            <TableCell>₹{r.cgst}</TableCell>
            <TableCell>₹{r.sgst}</TableCell>
            <TableCell>₹{r.igst}</TableCell>
            <TableCell>₹{r.totalTax}</TableCell>
            <TableCell className="font-medium">₹{r.totalValue}</TableCell>
          </TableRow>)}
          {data.rows.length > 0 && <TableRow className="font-semibold"><TableCell colSpan={3}>{t("Grand Total", "Grand Total")}</TableCell><TableCell>₹{data.grandTaxableValue}</TableCell><TableCell colSpan={3}></TableCell><TableCell>₹{data.grandTotalTax}</TableCell><TableCell>₹{data.grandTotalValue}</TableCell></TableRow>}
        </TableBody></Table>
        {!data.rows.length && <p>{t("No GST-compliant orders in this date range/scope.", "Is date range/scope mein koi GST-compliant orders nahi hain.")}</p>}
      </CardContent></Card>
    </>}
  </div>;
}
