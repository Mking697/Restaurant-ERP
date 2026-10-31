import { vatBreakdown } from "./vat";

// ---------------------------------------------------------------------------
// VAT Summary export (taxable value + VAT amount, grouped by productCode +
// rate, for a date/branch range) — the local replacement for GSTR-1's HSN
// Summary (Table 12). Tanzania has no GSTR-1/HSN statutory filing format to
// replicate, so this is a plain accounting summary, not a portal-upload
// file. Pure aggregation on top of the per-line vatBreakdown already used
// live in the POS order flow — this module does NOT recompute tax
// differently, it just groups the same per-line VAT by (productCode,
// ratePercent) across a date range. Kept separate from
// src/lib/server/vat.ts (single-order concern) since this is a multi-order
// reporting concern with its own grouping key.
// ---------------------------------------------------------------------------

export interface VatSummaryLineInput {
  productCode: string;
  ratePercent: string;
  qty: number;
  lineTotalDecimal: string; // taxable value for this line (price * qty)
}

export interface VatSummaryRow {
  productCode: string;
  ratePercent: string;
  totalQty: number;
  taxableValue: string;
  vatAmount: string;
  totalValue: string;
}

function addDecimal(a: string, b: string): string {
  return ((Math.round(Number(a) * 100) + Math.round(Number(b) * 100)) / 100).toFixed(2);
}

export function vatSummary(lines: VatSummaryLineInput[]): { rows: VatSummaryRow[]; grandTaxableValue: string; grandTotalTax: string; grandTotalValue: string } {
  const grouped = new Map<string, { productCode: string; ratePercent: string; totalQty: number; taxableValue: string; vatAmount: string }>();
  for (const line of lines) {
    const code = line.productCode || "UNSPECIFIED";
    const key = `${code}::${line.ratePercent}`;
    const b = vatBreakdown(line.lineTotalDecimal, line.ratePercent);
    const row = grouped.get(key) ?? { productCode: code, ratePercent: line.ratePercent, totalQty: 0, taxableValue: "0.00", vatAmount: "0.00" };
    row.totalQty += line.qty;
    row.taxableValue = addDecimal(row.taxableValue, b.taxableAmount);
    row.vatAmount = addDecimal(row.vatAmount, b.vatAmount);
    grouped.set(key, row);
  }
  const rows: VatSummaryRow[] = [...grouped.values()]
    .sort((a, b) => (a.productCode === b.productCode ? Number(a.ratePercent) - Number(b.ratePercent) : a.productCode.localeCompare(b.productCode)))
    .map((r) => ({ ...r, totalValue: addDecimal(r.taxableValue, r.vatAmount) }));
  const grandTaxableValue = rows.reduce((sum, r) => addDecimal(sum, r.taxableValue), "0.00");
  const grandTotalTax = rows.reduce((sum, r) => addDecimal(sum, r.vatAmount), "0.00");
  const grandTotalValue = addDecimal(grandTaxableValue, grandTotalTax);
  return { rows, grandTaxableValue, grandTotalTax, grandTotalValue };
}
