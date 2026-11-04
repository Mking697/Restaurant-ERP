import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";
import { posOrders } from "./pos";

export const posDrafts = pgTable("pos_drafts", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  status: text("status").notNull().default("DRAFT"),
  revision: integer("revision").notNull().default(1),
  payload: jsonb("payload").notNull(),
  orderId: text("order_id").references(() => posOrders.id),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("pos_drafts_branch_status_idx").on(table.branchId, table.status), uniqueIndex("pos_drafts_order_unique").on(table.orderId)]);

// Append-only successful action receipts. Never update/delete these on a retry.
// The branch key namespace also rejects cross-target/action/actor key reuse.
export const posLifecycleActions = pgTable("pos_lifecycle_actions", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  actorId: text("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  requestKey: text("request_key").notNull(),
  requestJson: jsonb("request_json").notNull(),
  responseJson: jsonb("response_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("pos_lifecycle_actions_branch_key_unique").on(table.branchId, table.requestKey), index("pos_lifecycle_actions_target_idx").on(table.targetType, table.targetId)]);

export const posLifecycleEvents = pgTable("pos_lifecycle_events", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  actorId: text("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  revision: integer("revision").notNull(),
  reason: text("reason"),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("pos_lifecycle_events_target_revision_unique").on(table.targetType, table.targetId, table.revision), index("pos_lifecycle_events_branch_idx").on(table.branchId)]);
