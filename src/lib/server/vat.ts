import { HttpError } from "./permissions";

// ---------------------------------------------------------------------------
// Tanzania VAT (TRA, Mainland Tanzania) — single flat rate, no CGST/SGST/IGST
// state-based split (that concept has no Tanzania equivalent). A rate is
// resolved per line by the caller as: the selling branch's own
// vatRatePercent override (branches.vatRatePercent) if set, else the menu
// item's own vatRatePercent (default "18.00"). This module only computes the
// tax on an already-resolved rate; it never looks up branch/item rows
// itself. Fixed-point paise math (same BigInt pattern as src/lib/server/
// expenses.ts's paise/decimal helpers) so this is precision-safe, same as
// the module it replaces (src/lib/server/gst.ts, removed).
//
// The pending 16% B2C bank-payment discount rate (Finance Act 2025) is NOT
// implemented here — it is still awaiting TRA's final implementation
// notice. Only the flat rate path exists; add the discount rate as a
// follow-up once TRA activates it.
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

export type VatBreakdown = {
  taxableAmount: string;
  ratePercent: string;
  vatAmount: string;
  totalWithTax: string;
};

// `ratePercent` is a whole-tax rate (e.g. "18.00" for 18% VAT) — charged in
// full, never split across legs like the old CGST/SGST/IGST model.
export function vatBreakdown(taxableAmountDecimal: string, ratePercent: string): VatBreakdown {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(ratePercent) || Number(ratePercent) < 0 || Number(ratePercent) > 100) throw new HttpError(400, "Invalid VAT rate");
  const taxable = paise(taxableAmountDecimal);
  const rateBasisPoints = BigInt(Math.round(Number(ratePercent) * 100)); // 2dp rate -> basis points of 10000
  const vatAmount = (taxable * rateBasisPoints) / BigInt(10000);
  return { taxableAmount: decimal(taxable), ratePercent, vatAmount: decimal(vatAmount), totalWithTax: decimal(taxable + vatAmount) };
}

// Sums vatBreakdown results across every order line, grouped by rate (the
// invoice-level summary a VAT Summary export needs — per-rate taxable + tax
// totals, not per-line). Returns rate -> aggregate, plus a grand total.
export function vatInvoiceSummary(lines: { taxableAmountDecimal: string; ratePercent: string }[]) {
  const byRate = new Map<string, { taxableAmount: bigint; vatAmount: bigint }>();
  for (const line of lines) {
    const b = vatBreakdown(line.taxableAmountDecimal, line.ratePercent);
    const row = byRate.get(line.ratePercent) ?? { taxableAmount: BigInt(0), vatAmount: BigInt(0) };
    row.taxableAmount += paise(b.taxableAmount);
    row.vatAmount += paise(b.vatAmount);
    byRate.set(line.ratePercent, row);
  }
  const rates = [...byRate.entries()].map(([ratePercent, row]) => ({
    ratePercent, taxableAmount: decimal(row.taxableAmount), vatAmount: decimal(row.vatAmount),
  }));
  const grandTaxable = rates.reduce((sum, r) => sum + paise(r.taxableAmount), BigInt(0));
  const grandVatAmount = rates.reduce((sum, r) => sum + paise(r.vatAmount), BigInt(0));
  return { rates, grandTaxable: decimal(grandTaxable), grandTotalTax: decimal(grandVatAmount), grandTotal: decimal(grandTaxable + grandVatAmount) };
}
