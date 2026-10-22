export const REPORT_DEFS = [
  { slug: "sales-trend", title: "Sales Trend", description: "Revenue + prime cost % over time, compiled or per branch." },
  { slug: "mis-scorecard", title: "MIS Scorecard", description: "On-time / delay / not-done breakdown + weighted score per employee." },
  { slug: "food-cost", title: "Food Cost & Menu Margin", description: "BOM-cost-driven food cost % per menu item, margin ranking." },
  { slug: "inventory-variance", title: "Inventory Variance", description: "Night variance (theoretical vs physical), pilferage flags." },
  { slug: "cash-reconciliation", title: "Cash Reconciliation", description: "Blind cash drop shortage/excess by cashier and branch." },
  { slug: "aggregator-recon", title: "Swiggy/Zomato Reconciliation", description: "Order value vs net payout, commission & ads spend." },
] as const;

export type ReportSlug = (typeof REPORT_DEFS)[number]["slug"];
