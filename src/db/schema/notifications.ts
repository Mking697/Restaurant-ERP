import { date, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";

// ---------------------------------------------------------------------------
// AUTOMATION-1b — daily ~8AM operational summary. One row per (branch, IST
// calendar day) claims that day's summary for that branch BEFORE any
// WhatsApp send is attempted — same "claim first, send best-effort after"
// idempotency convention as the rest of this file's unique-index guards
// (task_instances_recurring_due_unique etc.). A retried/overlapping cron
// tick on the same day hits the unique violation and is treated as a no-op,
// exactly like generateRecurringOccurrences already does for recurring
// task generation.
// ---------------------------------------------------------------------------
export const dailySummaryLog = pgTable(
  "daily_summary_log",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    summaryDate: date("summary_date").notNull(), // IST calendar date (YYYY-MM-DD) this summary covers
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("daily_summary_log_branch_date_unique").on(table.branchId, table.summaryDate),
    index("daily_summary_log_branch_id_idx").on(table.branchId),
  ]
);
