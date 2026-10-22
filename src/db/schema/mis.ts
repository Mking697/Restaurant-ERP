import { index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";

/**
 * 100-point weighted MIS score (40% task/30% delegation/20% variance/10%
 * cashier) PLUS a Pro-ERP-style simple on-time/delay/not-done breakdown so
 * the leaderboard page can show both the % score and the raw counts.
 */
export const misScores = pgTable(
  "mis_scores",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: text("user_id").references(() => users.id), // null = branch-level aggregate
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    taskScore: numeric("task_score", { precision: 5, scale: 2 }).notNull(), // 40%, on-time recurring tasks
    delegationScore: numeric("delegation_score", { precision: 5, scale: 2 }).notNull(), // 30%
    varianceScore: numeric("variance_score", { precision: 5, scale: 2 }).notNull(), // 20%, inventory variance
    cashierScore: numeric("cashier_score", { precision: 5, scale: 2 }).notNull(), // 10%, zero-discrepancy
    totalScore: numeric("total_score", { precision: 5, scale: 2 }).notNull(), // weighted sum /100
    onTimeCount: integer("on_time_count").notNull().default(0),
    delayCount: integer("delay_count").notNull().default(0),
    notDoneCount: integer("not_done_count").notNull().default(0),
    rank: integer("rank"), // chain-wide leaderboard position
  },
  (table) => [
    uniqueIndex("mis_scores_branch_user_period_unique").on(table.branchId, table.userId, table.periodStart),
    index("mis_scores_branch_period_idx").on(table.branchId, table.periodStart),
  ]
);
