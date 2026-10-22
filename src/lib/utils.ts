import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatInr(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    n || 0
  );
}

export function formatPercent(value: number | string, digits = 1): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `${(n || 0).toFixed(digits)}%`;
}
