"use client";
import { useUiCopy } from "@/lib/ui-copy";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { useSelectedBranchId } from "@/lib/current-branch";
import { downloadCsv } from "@/lib/csv-export";
import { Download } from "lucide-react";

interface HsnRow { hsnSacCode: string; ratePercent: string; totalQty: number; taxableValue: string; cgst: string; sgst: string; igst: string; totalTax: string; totalValue: string; }
interface SummaryResponse { rows: HsnRow[]; grandTaxableValue: string; grandTotalTax: string; grandTotalValue: string; ordersIncluded: number; ordersExcludedNoGst: number; }

const inputClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
function today() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }

export default function GstExportPage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const allowed = hasCurrentModule(actor, "POS_CASHIER");

  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());
  const [data, setData] = React.useState<SummaryResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true); setError(""); setData(null);
    try {
      const url = `/api/gst/gstr1-hsn-summary?from=${from}&to=${to}` + (selected !== "all" ? `&branchId=${encodeURIComponent(selected)}` : "");
      const result = await requestJson<SummaryResponse>(url);
      setData(result);
    } catch (err) { setError(err instanceof Error ? err.message : "Load failed"); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { if (allowed) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [allowed]);

  function exportCsv() {
    if (!data?.rows.length) return;
    downloadCsv(`gstr1-hsn-summary-${from}-to-${to}.csv`, data.rows.map((r) => ({
      "HSN/SAC": r.hsnSacCode, "Rate %": r.ratePercent, "Total Qty": r.totalQty, "Taxable Value": r.taxableValue, CGST: r.cgst, SGST: r.sgst, IGST: r.igst, "Total Tax": r.totalTax, "Total Value": r.totalValue,
    })));
  }

  return <AppShell activeHref="/gst-export">
    <PageHeader title={uiText("GSTR-1 HSN Summary Export")} description={uiText("Table 12 style HSN-wise outward supply summary, grouped by HSN/SAC + rate — built from real completed orders, ready to paste into the GST portal's offline tool.", "Table 12 jaisa HSN-wise summary, real completed orders se bana — GST portal ke offline tool mein seedha paste ho sakta hai.")}>
      <Button size="sm" variant="outline" disabled={!data?.rows.length} onClick={exportCsv}><Download className="size-4" /> {uiText("Export CSV")}</Button>
    </PageHeader>

    {!allowed ? <p role="alert">{uiText("POS / Cashier permission is required.")}</p> : <>
      <Card className="mb-4"><CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <label className="block space-y-1 text-xs font-medium"><span>{uiText("From")}</span><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="block space-y-1 text-xs font-medium"><span>{uiText("To")}</span><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button size="sm" disabled={loading} onClick={load}>{loading ? uiText("Loading…") : uiText("Generate")}</Button>
      </CardContent></Card>

      {error && <p role="alert" className="mb-4 text-destructive">{uiText(error)}</p>}

      {data && <>
        {data.ordersExcludedNoGst > 0 && <p role="alert" className="mb-3 text-sm text-destructive">{uiText(`${data.ordersExcludedNoGst} order(s) in this range are EXCLUDED — their branch or company GST state code isn't configured yet, so they can't be part of a GST filing.`)}</p>}
        <p className="mb-3 text-sm text-muted-foreground">{uiText(`${data.ordersIncluded} GST-compliant order(s) included in this summary.`)}</p>
        <Card><CardContent className="pt-5">
          <Table><TableHeader><TableRow><TableHead>{uiText("HSN/SAC")}</TableHead><TableHead>{uiText("Rate %")}</TableHead><TableHead>{uiText("Qty")}</TableHead><TableHead>{uiText("Taxable Value")}</TableHead><TableHead>{uiText("CGST")}</TableHead><TableHead>{uiText("SGST")}</TableHead><TableHead>{uiText("IGST")}</TableHead><TableHead>{uiText("Total Tax")}</TableHead><TableHead>{uiText("Total Value")}</TableHead></TableRow></TableHeader><TableBody>
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
            {data.rows.length > 0 && <TableRow className="font-semibold"><TableCell colSpan={3}>{uiText("Grand Total")}</TableCell><TableCell>₹{data.grandTaxableValue}</TableCell><TableCell colSpan={3}></TableCell><TableCell>₹{data.grandTotalTax}</TableCell><TableCell>₹{data.grandTotalValue}</TableCell></TableRow>}
          </TableBody></Table>
          {!data.rows.length && <p>{uiText("No GST-compliant orders in this date range/scope.")}</p>}
        </CardContent></Card>
      </>}
    </>}
  </AppShell>;
}
