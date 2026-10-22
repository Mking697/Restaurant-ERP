"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasCurrentModule, useCurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { useTranslation } from "@/lib/i18n";
import { ActionState, DataTable, Field, inputClass, LoadState, money, monthEnd, monthNow, Panel, post, query, today, useAction, useResource } from "../workforce/live-ui";
import LegacyAccountsDemo from "./legacy-demos";
import { createExpenseAttempt } from "@/lib/expense-attempt";

type Category = "RENT" | "UTILITIES" | "MARKETING" | "OTHER";
const categories: Category[] = ["RENT", "UTILITIES", "MARKETING", "OTHER"];
type Expense = { id: string; date: string; category: Category; subcategory: string | null; amount: string; description: string; reference: string | null; status: string; voidReason?: string | null };
type Expenses = { expenses: Expense[]; totals: Record<Category, string> };
type ProfitLoss = { expenses: Record<Category, string>; laborCost: string; totalOperatingExpenses: string; revenue: null; cogs: null; grossProfit: null; netProfit: null; salesConnected: false; notes: string[] };
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
  const any = pnl || petty || recon;
  return <><PageHeader title={t("Accounts", "Accounts")} description={t("Saved expenses and finalized payroll costs. Other tabs are explicitly labelled demonstrations, not live accounts.", "Saved expenses aur final payroll costs. Baaki tabs saaf taur par demos hain, live accounts nahi.")} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!any ? <p role="alert">{t("Accounts permission is required.", "Accounts permission chahiye.")}</p> : <>
      {pnl && <div className="mb-4 grid max-w-xl gap-3 sm:grid-cols-2"><Field label={t("Branch", "Branch")}><select className={inputClass} value={validBranch ? branchId : ""} disabled={actor.role !== "SUPER_ADMIN" || selected !== "all"} onChange={e => setChoice(e.target.value)}><option value="">{t("Select one branch", "Ek branch chuno")}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field><Field label={t("Month", "Mahina")}><input className={inputClass} type="month" required value={month} onChange={e => setMonth(e.target.value)} /></Field></div>}
      <Tabs defaultValue={allowed ? "expenses" : pnl ? "pnl" : "demos"}><TabsList>{allowed && <TabsTrigger value="expenses">{t("Expenses", "Kharche")}</TabsTrigger>}{pnl && <TabsTrigger value="pnl">{t("Profit & Loss", "Profit & Loss")}</TabsTrigger>}{(petty || recon) && <TabsTrigger value="demos">{t("Other accounts · Demo", "Baaki accounts · Demo")}</TabsTrigger>}</TabsList>
        {allowed && <TabsContent value="expenses">{validBranch && month ? <ExpensePanel key={`${branchId}:${month}`} branchId={branchId} month={month} /> : <Panel>{t("Select a branch and month to view or post real expenses.", "Real expenses dekhne ya save karne ke liye branch aur mahina chuno.")}</Panel>}</TabsContent>}{pnl && <TabsContent value="pnl">{validBranch && month ? <ProfitLossPanel key={`${branchId}:${month}`} branchId={branchId} month={month} /> : <Panel>{t("Select a branch and month.", "Branch aur mahina chuno.")}</Panel>}</TabsContent>}
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
  return <Panel><h2 className="font-semibold">{t("Operating costs · not a complete P&L", "Operating costs · poora P&L nahi")}</h2><p>{t("Only posted expenses and FINAL payroll snapshots are included. Draft payroll is excluded. Revenue, COGS and profit are not connected, not zero.", "Sirf posted expenses aur FINAL payroll snapshots shamil hain. Draft payroll shamil nahi. Revenue, COGS aur profit connected nahi hain, zero nahi.")}</p><LoadState {...resource} />{resource.data && <><DataTable headers={[t("Line", "Line"),t("Amount", "Amount")]}>{categories.map(c => <tr key={c}><td>{categoryLabel(c,t)}</td><td>{money(resource.data!.expenses[c])}</td></tr>)}<tr><td>{t("Labor · finalized payroll only", "Labor · sirf final payroll")}</td><td>{money(resource.data.laborCost)}</td></tr><tr className="font-semibold"><td>{t("Total operating expenses", "Kul operating kharche")}</td><td>{money(resource.data.totalOperatingExpenses)}</td></tr>{[t("Revenue", "Revenue"),t("Cost of goods sold", "Bikri ki lagat"),t("Gross profit", "Gross profit"),t("Net profit", "Net profit")].map(label => <tr key={label}><td>{label}</td><td>{t("Not connected", "Connected nahi")}</td></tr>)}</DataTable>{resource.data.notes.map((note,i) => <p key={i} className="text-sm text-muted-foreground">{note}</p>)}</>}</Panel>;
}
function categoryLabel(category: Category, t: (en:string, hi?:string) => string) { return ({RENT:t("Rent", "Kiraya"),UTILITIES:t("Utilities", "Bijli / paani"),MARKETING:t("Marketing", "Marketing"),OTHER:t("Other", "Anya")})[category]; }
