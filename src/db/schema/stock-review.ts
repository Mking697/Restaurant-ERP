import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { rawMaterials } from "./menu";
import { users } from "./auth";
import { internalRequisitions } from "./requisitions";
import { indents } from "./purchase";

// GAP-021: immutable preview identity for one exact branch/material supply
// position. Conversion links the existing GAP-014 requisition and purchase
// indent workflows; neither request is automatically approved or fulfilled.
export const reorderSuggestions = pgTable(
  "reorder_suggestions",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    rawMaterialId: text("raw_material_id").notNull().references(() => rawMaterials.id),
    positionFingerprint: text("position_fingerprint").notNull().unique(),
    positionJson: jsonb("position_json").notNull(),
    unit: text("unit").notNull(),
    suggestedQty: numeric("suggested_qty", { precision: 12, scale: 3 }).notNull(),
    internalQty: numeric("internal_qty", { precision: 12, scale: 3 }).notNull(),
    externalQty: numeric("external_qty", { precision: 12, scale: 3 }).notNull(),
    createdById: text("created_by_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    conversionRequestKey: text("conversion_request_key").unique(),
    internalRequisitionId: text("internal_requisition_id").references(() => internalRequisitions.id),
    externalIndentId: text("external_indent_id").references(() => indents.id),
    convertedById: text("converted_by_id").references(() => users.id),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
  },
  (table) => [index("reorder_suggestions_branch_idx").on(table.branchId), index("reorder_suggestions_material_idx").on(table.rawMaterialId)]
);

export const hoStockReviewSubjects = pgTable(
  "ho_stock_review_subjects",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    subjectType: text("subject_type").$type<"GRN" | "EOD_STOCK">().notNull(),
    sourceId: text("source_id").notNull(),
    sourceRevision: integer("source_revision").notNull().default(1),
    exception: boolean("exception").notNull().default(false),
    summaryJson: jsonb("summary_json").notNull(),
    submittedById: text("submitted_by_id").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ho_stock_review_subject_source_revision_unique").on(table.subjectType, table.sourceId, table.sourceRevision),
    index("ho_stock_review_subject_branch_idx").on(table.branchId),
  ]
);

// Append-only review events per exact subject revision. Escalations remain open
// until a later acknowledgment. actionKey makes
// an unknown-outcome replay return the committed event instead of writing twice.
export const hoStockReviewEvents = pgTable(
  "ho_stock_review_events",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id").notNull().references(() => hoStockReviewSubjects.id),
    action: text("action").$type<"ACKNOWLEDGE" | "ESCALATE">().notNull(),
    actionKey: text("action_key").notNull().unique(),
    reason: text("reason").notNull().default(""),
    actorId: text("actor_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ho_stock_review_event_actor_idx").on(table.actorId)]
);
