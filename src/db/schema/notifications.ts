import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";

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

// ---------------------------------------------------------------------------
// GAP-020 (November 2026). Full end-of-day stock + reorder-status report.
// Owner decisions: (1) RAW materials get the FULL ledger-cutoff
// opening/receipt/issue/wastage/adjust/closing breakdown (reconstructed
// from stockMovements + the stock-transfer tables, since stock-transfer
// dispatch/receive do NOT post to stockMovements yet); Prepared(Semi-FG)
// and expiry stay COUNT-level only, reusing the existing threshold
// calculators — no new movement breakdown for those. (2) Reports UI/CSV
// only this pass, no new WhatsApp/email auto-send. (3) Simple
// latest-wins versioning: one current row per (branch, reportDate); a
// regeneration overwrites it in place, with the SUPERSEDED snapshot kept
// in auditLog (never silently lost), not a full multi-version table.
//
// snapshotJson's exact shape is owned by src/lib/server/eod-report.ts —
// never read/written directly from any other module.
export const eodStockReports = pgTable(
  "eod_stock_reports",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    reportDate: date("report_date").notNull(), // Tanzania EAT calendar date (UTC+03:00)
    snapshotJson: jsonb("snapshot_json").notNull(),
    revision: integer("revision").notNull().default(1),
    generationSource: text("generation_source").$type<"MANUAL" | "SCHEDULED">().notNull().default("MANUAL"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    lastRequestKey: text("last_request_key").notNull().unique(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    generatedById: text("generated_by_id").references(() => users.id),
    regeneratedAt: timestamp("regenerated_at", { withTimezone: true }),
    regeneratedById: text("regenerated_by_id").references(() => users.id),
  },
  (table) => [
    uniqueIndex("eod_stock_reports_branch_date_unique").on(table.branchId, table.reportDate),
    index("eod_stock_reports_branch_id_idx").on(table.branchId),
  ]
);
