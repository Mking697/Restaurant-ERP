import { numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";

// Multi-currency billing — scope decision (confirmed with user): every
// order's price/GST ledger of record stays in INR (menu pricing, BOM
// costing and GST are all legally INR regardless of who's paying), this
// table only feeds the OPTIONAL "amount payable in a foreign currency"
// conversion shown on the receipt for NRI/export customers. One row per
// currency = the LATEST rate; Owner-only edits, each POS order SNAPSHOTS
// the rate it used at sale time onto pos_orders.fx_rate_to_inr — never
// recomputed later, same convention as src/lib/server/vat.ts locking in
// the rate/amount at the moment of the transaction.
export const currencyRates = pgTable(
  "currency_rates",
  {
    id: text("id").primaryKey(),
    currencyCode: text("currency_code").notNull(), // ISO 4217: USD, EUR, GBP, AED, ...
    rateToInr: numeric("rate_to_inr", { precision: 12, scale: 6 }).notNull(), // 1 unit of currencyCode = this many INR
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("currency_rates_code_unique").on(table.currencyCode)]
);
