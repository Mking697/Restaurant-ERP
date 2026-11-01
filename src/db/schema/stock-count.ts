import { check, index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "./platform";
import { rawMaterials } from "./menu";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// GAP-007 (November 2026). A FORMAL, approval-gated physical stock count —
// distinct from GAP-004's nightVarianceEntries (src/db/schema/inventory.ts),
// which is a quick chef self-report that auto-posts immediately, no separate
// review. Both are kept side by side (Owner decision): night-variance is the
// fast daily shift check; this is a periodic audited count with a mandatory,
// different-person approval before anything posts. RAW MATERIAL only this
// pass — prepared/Semi-FG counting is deferred to GAP-009/GAP-012.
//
// Lifecycle: DRAFT (lines' expectedQty snapshotted from the live
// inventory_stock balance at creation time, hidden from the counter in the
// UI until submit — a blind count) -> SUBMITTED (counter enters physicalQty
// per line) -> APPROVED (a DIFFERENT user reviews and posts one signed
// stock_movements delta per line, movementType PHYSICAL_COUNT_ADJUST, same
// type nightVarianceEntries already uses) or REJECTED (sent back, no stock
// mutation; the count stays terminal — start a new one to recount).
//
// The approved delta is computed against the FROZEN cutoff snapshot
// (physicalQty - expectedQty-at-cutoff) but applied to whatever the CURRENT
// live balance is at approval time — never an overwrite — so a GRN/sale/
// transfer that happened between cutoff and approval is never silently
// erased. See src/lib/server/stock-count.ts.
// ---------------------------------------------------------------------------

export const stockCountStatusEnum = pgEnum("stock_count_status", ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    status: stockCountStatusEnum("status").notNull().default("DRAFT"),
    startedById: text("started_by_id").notNull().references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedById: text("submitted_by_id").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // Hard rule (Owner decision): the user who submitted a count can NEVER
    // also approve it, regardless of role — enforced in stock-count.ts
    // against this column, not just by role, so even SUPER_ADMIN cannot
    // self-approve their own submitted count.
    approvedById: text("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    reviewNote: text("review_note").notNull().default(""),
  },
  (table) => [
    index("stock_counts_branch_status_idx").on(table.branchId, table.status),
    check("stock_counts_submit_fields", sql`(${table.status} = 'DRAFT' AND ${table.submittedById} IS NULL AND ${table.submittedAt} IS NULL) OR (${table.status} != 'DRAFT')`),
    check("stock_counts_approve_fields", sql`(${table.status} IN ('APPROVED', 'REJECTED') AND ${table.approvedById} IS NOT NULL AND ${table.approvedAt} IS NOT NULL) OR (${table.status} IN ('DRAFT', 'SUBMITTED'))`),
  ]
);

export const stockCountLines = pgTable(
  "stock_count_lines",
  {
    id: text("id").primaryKey(),
    countId: text("count_id").notNull().references(() => stockCounts.id),
    rawMaterialId: text("raw_material_id").notNull().references(() => rawMaterials.id),
    // The system's own live inventory_stock.qtyOnHand, captured server-side
    // when the count line is created (DRAFT) — never client-supplied, so it
    // can never be faked by the counter. This is the count's cutoff.
    expectedQty: numeric("expected_qty", { precision: 12, scale: 3 }).notNull(),
    // Null until the counter submits; the real counted quantity.
    physicalQty: numeric("physical_qty", { precision: 12, scale: 3 }),
  },
  (table) => [
    uniqueIndex("stock_count_lines_count_material_unique").on(table.countId, table.rawMaterialId),
  ]
);
