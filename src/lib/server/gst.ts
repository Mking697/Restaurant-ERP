import { HttpError } from "./permissions";

// ---------------------------------------------------------------------------
// GST breakdown — single company GSTIN, branch-wise invoicing. Same-state as
// the company's registered GST state -> CGST+SGST split; different state ->
// IGST. Fixed-point paise math (same BigInt pattern as src/lib/server/
// expenses.ts's paise/decimal helpers) so this is precision-safe from day
// one, unlike the BOM costing estimate which deliberately stayed float for a
// planning tool — GST numbers are real tax, never approximate.
//
// Planned-feature scaffolding: not wired into any invoice/POS endpoint yet.
// ---------------------------------------------------------------------------

function paise(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new HttpError(400, "Invalid amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
function decimal(value: bigint): string {
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, "0")}`;
}

export type GstBreakdown = {
  taxableAmount: string;
  ratePercent: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
  totalWithTax: string;
  isInterState: boolean;
};

// `ratePercent` is a whole-tax rate (e.g. "5.00" for 5% GST) — split evenly
// into CGST+SGST (2.5% each) for intra-state, or charged whole as IGST for
// inter-state. Half-rupee-paise rounding is applied per leg independently so
// CGST+SGST always sums back to the same total as a single IGST charge would.
export function gstBreakdown(taxableAmountDecimal: string, ratePercent: string, branchStateCode: string, companyStateCode: string): GstBreakdown {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(ratePercent) || Number(ratePercent) < 0 || Number(ratePercent) > 100) throw new HttpError(400, "Invalid GST rate");
  if (!branchStateCode || !companyStateCode) throw new HttpError(400, "GST state code not configured for this branch or company — set it before billing");
  const taxable = paise(taxableAmountDecimal);
  const rateBasisPoints = BigInt(Math.round(Number(ratePercent) * 100)); // 2dp rate -> basis points of 10000
  const totalTax = (taxable * rateBasisPoints) / BigInt(10000);
  const isInterState = branchStateCode !== companyStateCode;
  if (isInterState) {
    return { taxableAmount: decimal(taxable), ratePercent, cgst: "0.00", sgst: "0.00", igst: decimal(totalTax), totalTax: decimal(totalTax), totalWithTax: decimal(taxable + totalTax), isInterState };
  }
  const half = totalTax / BigInt(2);
  const remainder = totalTax - half * BigInt(2); // odd paise goes to CGST, matches common invoicing convention
  const cgst = half + remainder;
  const sgst = half;
  return { taxableAmount: decimal(taxable), ratePercent, cgst: decimal(cgst), sgst: decimal(sgst), igst: "0.00", totalTax: decimal(cgst + sgst), totalWithTax: decimal(taxable + cgst + sgst), isInterState };
}

// Sums gstBreakdown results across every order line, grouped by rate (the
// invoice-level summary a GSTR-1/3B export would need — per-rate taxable +
// tax totals, not per-line). Returns rate -> aggregate, plus a grand total.
export function gstInvoiceSummary(lines: { taxableAmountDecimal: string; ratePercent: string }[], branchStateCode: string, companyStateCode: string) {
  const byRate = new Map<string, { taxableAmount: bigint; cgst: bigint; sgst: bigint; igst: bigint }>();
  for (const line of lines) {
    const b = gstBreakdown(line.taxableAmountDecimal, line.ratePercent, branchStateCode, companyStateCode);
    const row = byRate.get(line.ratePercent) ?? { taxableAmount: BigInt(0), cgst: BigInt(0), sgst: BigInt(0), igst: BigInt(0) };
    row.taxableAmount += paise(b.taxableAmount); row.cgst += paise(b.cgst); row.sgst += paise(b.sgst); row.igst += paise(b.igst);
    byRate.set(line.ratePercent, row);
  }
  const rates = [...byRate.entries()].map(([ratePercent, row]) => ({
    ratePercent, taxableAmount: decimal(row.taxableAmount), cgst: decimal(row.cgst), sgst: decimal(row.sgst), igst: decimal(row.igst), totalTax: decimal(row.cgst + row.sgst + row.igst),
  }));
  const grandTotalTax = rates.reduce((sum, r) => sum + paise(r.totalTax), BigInt(0));
  const grandTaxable = rates.reduce((sum, r) => sum + paise(r.taxableAmount), BigInt(0));
  return { rates, grandTaxable: decimal(grandTaxable), grandTotalTax: decimal(grandTotalTax), grandTotal: decimal(grandTaxable + grandTotalTax) };
}
