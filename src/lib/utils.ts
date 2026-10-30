import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Tanzanian Shilling (TZS). Intl's "en-TZ"/"sw-TZ" currency formatting is not
// reliably supported across Node/browser ICU builds, so this formats the
// number with grouping and prefixes the common local "TSh" notation
// (e.g. "TSh 12,500") rather than relying on style:"currency".
export function formatCurrency(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `TSh ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0)}`;
}
// Back-compat alias — same formatter, old name. Prefer formatCurrency in new code.
export const formatInr = formatCurrency;

export function formatPercent(value: number | string, digits = 1): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `${(n || 0).toFixed(digits)}%`;
}
