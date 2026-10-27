import { gstBreakdown } from "./gst";

// ---------------------------------------------------------------------------
// GSTR-1 "HSN Summary" (Table 12) export — the standard rate+HSN-wise outward
// supply summary every GSTR-1 filing needs. Pure aggregation on top of the
// per-line gstBreakdown already used live in the POS order flow — this
// module does NOT recompute tax differently, it just groups the same
// per-line CGST/SGST/IGST by (hsnSacCode, ratePercent) across a date range.
// Kept separate from src/lib/server/gst.ts (single-order concern) since this
// is a multi-order reporting concern with its own grouping key.
// ---------------------------------------------------------------------------

export interface GstrLineInput {
  hsnSacCode: string;
  ratePercent: string;
  qty: number;
  lineTotalDecimal: string; // taxable value for this line (price * qty)
  branchStateCode: string;
  companyStateCode: string;
}

export interface HsnSummaryRow {
  hsnSacCode: string;
  ratePercent: string;
  totalQty: number;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
  totalValue: string;
}

function addDecimal(a: string, b: string): string {
  return ((Math.round(Number(a) * 100) + Math.round(Number(b) * 100)) / 100).toFixed(2);
}

export function hsnSummary(lines: GstrLineInput[]): { rows: HsnSummaryRow[]; grandTaxableValue: string; grandTotalTax: string; grandTotalValue: string } {
  const grouped = new Map<string, { hsnSacCode: string; ratePercent: string; totalQty: number; taxableValue: string; cgst: string; sgst: string; igst: string }>();
  for (const line of lines) {
    const hsn = line.hsnSacCode || "UNSPECIFIED";
    const key = `${hsn}::${line.ratePercent}`;
    const b = gstBreakdown(line.lineTotalDecimal, line.ratePercent, line.branchStateCode, line.companyStateCode);
    const row = grouped.get(key) ?? { hsnSacCode: hsn, ratePercent: line.ratePercent, totalQty: 0, taxableValue: "0.00", cgst: "0.00", sgst: "0.00", igst: "0.00" };
    row.totalQty += line.qty;
    row.taxableValue = addDecimal(row.taxableValue, b.taxableAmount);
    row.cgst = addDecimal(row.cgst, b.cgst);
    row.sgst = addDecimal(row.sgst, b.sgst);
    row.igst = addDecimal(row.igst, b.igst);
    grouped.set(key, row);
  }
  const rows: HsnSummaryRow[] = [...grouped.values()]
    .sort((a, b) => (a.hsnSacCode === b.hsnSacCode ? Number(a.ratePercent) - Number(b.ratePercent) : a.hsnSacCode.localeCompare(b.hsnSacCode)))
    .map((r) => {
      const totalTax = addDecimal(addDecimal(r.cgst, r.sgst), r.igst);
      return { ...r, totalTax, totalValue: addDecimal(r.taxableValue, totalTax) };
    });
  const grandTaxableValue = rows.reduce((sum, r) => addDecimal(sum, r.taxableValue), "0.00");
  const grandTotalTax = rows.reduce((sum, r) => addDecimal(sum, r.totalTax), "0.00");
  const grandTotalValue = addDecimal(grandTaxableValue, grandTotalTax);
  return { rows, grandTaxableValue, grandTotalTax, grandTotalValue };
}
