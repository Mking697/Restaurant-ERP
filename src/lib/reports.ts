export const REPORT_DEFS = [
  { slug: "sales-trend", title: "Sales Trend", description: "Real daily completed-sale revenue, compiled or per branch." },
  { slug: "mis-scorecard", title: "MIS Scorecard", description: "Saved branch scores, recurring-task counts and measured component coverage." },
  { slug: "food-cost", title: "Food Cost & Menu Margin", description: "Sold-item recipe cost estimates using current rates; missing costs stay unavailable." },
  { slug: "inventory-variance", title: "Inventory Variance", description: "Night variance (theoretical vs physical), pilferage flags." },
  { slug: "cash-reconciliation", title: "Cash Reconciliation", description: "Blind cash drop shortage/excess by cashier and branch." },
  { slug: "aggregator-recon", title: "Swiggy/Zomato Reconciliation", description: "Order value vs net payout, commission & ads spend." },
] as const;

export type ReportSlug = (typeof REPORT_DEFS)[number]["slug"];
// Reports never implicitly grants underlying operational module reads.
export function reportReadModule(slug: ReportSlug) {
  if (slug === "mis-scorecard") return "MIS_PERFORMANCE" as const;
  if (slug === "inventory-variance") return "INVENTORY" as const;
  if (slug === "aggregator-recon") return "AGGREGATOR_RECON" as const;
  return "REPORTS" as const;
}
