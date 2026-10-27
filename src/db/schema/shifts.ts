import { boolean, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";
import { cashDrops } from "./pos";

export const shiftRunStatusEnum = pgEnum("shift_run_status", ["OPEN", "ENDED"]);
export const shiftHandoverStatusEnum = pgEnum("shift_handover_status", ["PENDING", "ACCEPTED"]);

/**
 * One row per configured shift WINDOW for a branch (e.g. "Shift A" 09:00-17:00).
 * Branch Admin (own branch) or Owner (any branch) sets these; editing a
 * definition only affects shift_runs created AFTER the edit — a run's own
 * startedAt/endedAt are frozen at creation time, so changing start/end times
 * here never rewrites a past shift's actual recorded window.
 * startTime/endTime are "HH:MM" 24h strings, validated + continuity-checked
 * (every branch's shifts must tile a full 24h day with zero gaps/overlaps,
 * in sortOrder cycle order — endTime may be < startTime, meaning it crosses
 * midnight) at the API layer, see src/lib/server/shifts.ts.
 */
export const branchShifts = pgTable(
  "branch_shifts",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    label: text("label").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("branch_shifts_branch_id_idx").on(table.branchId)]
);

/**
 * One row per ACTUAL shift session that ran at a branch — the operational
 * handover cycle. Exactly one OPEN run per branch at a time (enforced at the
 * API layer with the same advisory-lock pattern Semi-FG production uses, not
 * a DB constraint — see lockShiftState in src/lib/server/shifts.ts).
 */
export const shiftRuns = pgTable(
  "shift_runs",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    shiftDefinitionId: text("shift_definition_id")
      .notNull()
      .references(() => branchShifts.id),
    label: text("label").notNull(), // snapshot of the definition's label at start time
    status: shiftRunStatusEnum("status").notNull().default("OPEN"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    startedBy: text("started_by")
      .notNull()
      .references(() => users.id),
    endedBy: text("ended_by").references(() => users.id),
  },
  (table) => [index("shift_runs_branch_id_idx").on(table.branchId)]
);

/**
 * Shift A -> Shift B handover, created the moment A is ended. cashAmount
 * comes from the closing Blind Cash Drop count submitted as part of ending
 * the shift; card/upi/otherAmount are computed server-side from this run's
 * own pos_orders tender totals — never typed in by a human. toRun's
 * cashiers are blocked from taking new POS orders until this is accepted
 * (see requireAcceptedHandover in src/lib/server/shifts.ts).
 */
export const shiftHandovers = pgTable(
  "shift_handovers",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    fromRunId: text("from_run_id")
      .notNull()
      .references(() => shiftRuns.id),
    toRunId: text("to_run_id")
      .notNull()
      .references(() => shiftRuns.id),
    closingCashDropId: text("closing_cash_drop_id")
      .notNull()
      .references(() => cashDrops.id),
    cashAmount: numeric("cash_amount", { precision: 10, scale: 2 }).notNull(),
    cardAmount: numeric("card_amount", { precision: 10, scale: 2 }).notNull(),
    upiAmount: numeric("upi_amount", { precision: 10, scale: 2 }).notNull(),
    otherAmount: numeric("other_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    status: shiftHandoverStatusEnum("status").notNull().default("PENDING"),
    acceptedBy: text("accepted_by").references(() => users.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shift_handovers_to_run_unique").on(table.toRunId),
    index("shift_handovers_branch_id_idx").on(table.branchId),
  ]
);
