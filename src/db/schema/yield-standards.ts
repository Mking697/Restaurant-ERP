import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { menuItems } from "./menu";
import { actualCuttingProductions } from "./cutting-production";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// GAP-011 (November 2026). Approved, versioned yield standards for Actual
// Cutting (GAP-009/010) — SCOPED THIS PASS to Actual Cutting only, per Owner
// decision (same scope pattern as GAP-010). Fixed-Recipe production is
// untouched.
//
// Owner decisions (confirmed via clarify):
//   1. Scope: Actual Cutting only.
//   2. SOFT flag only — a deviation NEVER blocks the production (that is
//      GAP-009's own hard conservation/tolerance rule, a separate and
//      already-shipped mechanism this GAP does not touch). A deviation is
//      recorded for later review; the production always posts.
//   3. Only the Owner (SUPER_ADMIN) may set a standard or review a flagged
//      deviation — simplified to a single-actor action (Owner sets a new
//      standard, immediately effective) rather than a separate multi-actor
//      draft/submit/approve pipeline, since only one role is involved.
//   4. This pass tracks a yield % band only (not cost — GAP-010 already
//      covers real cost separately).
//
// yieldPercent (evaluated per Actual Cutting production) = outputMassKg /
// inputTotalKg * 100 — how much real output mass came out of the real
// input mass, a meat-cutting-floor definition of "yield". This is a
// DIFFERENT figure from GAP-009's unaccountedLossPercent (which nets out
// waste); it answers "was the output mass itself in the expected range",
// not "was material unaccounted for".
//
// Versioning: at most one standard per menuItemId has supersededAt NULL
// (the "current" one) — enforced by the partial unique index below. Setting
// a new standard for an item supersedes (never edits/deletes) the old one.
// A deviation row freezes the standard id AND its min/max band AT
// evaluation time, so a later standard relaxation/tightening can NEVER
// retroactively rewrite a past production's recorded deviation — matching
// gaps.md's own proof scenario.
//
// A missing standard for an item means NOTHING is evaluated (no deviation
// is possible) — never a fabricated default band.
// ---------------------------------------------------------------------------

export const cuttingYieldStandards = pgTable(
  "cutting_yield_standards",
  {
    id: text("id").primaryKey(),
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    minYieldPercent: numeric("min_yield_percent", { precision: 5, scale: 2 }).notNull(),
    maxYieldPercent: numeric("max_yield_percent", { precision: 5, scale: 2 }).notNull(),
    approvedById: text("approved_by_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // NULL = this is the CURRENT standard for menuItemId. Set the moment a
    // newer standard for the same item is created — the old row itself is
    // never edited, only superseded.
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("cutting_yield_standards_current_unique").on(table.menuItemId).where(sql`${table.supersededAt} is null`),
    index("cutting_yield_standards_item_idx").on(table.menuItemId),
    check("cutting_yield_standards_range_valid", sql`${table.minYieldPercent} >= 0 and ${table.maxYieldPercent} <= 100 and ${table.minYieldPercent} <= ${table.maxYieldPercent}`),
  ]
);

export const cuttingYieldDeviations = pgTable(
  "cutting_yield_deviations",
  {
    id: text("id").primaryKey(),
    cuttingProductionId: text("cutting_production_id").notNull().references(() => actualCuttingProductions.id),
    standardId: text("standard_id").notNull().references(() => cuttingYieldStandards.id),
    yieldPercent: numeric("yield_percent", { precision: 6, scale: 2 }).notNull(),
    // Frozen copy of the standard's band AT evaluation time — belt-and-
    // braces alongside the standardId FK, matching this codebase's existing
    // "snapshot, never re-derive" convention (e.g. outputUnitAtSubmission).
    minYieldPercentAtEvaluation: numeric("min_yield_percent_at_evaluation", { precision: 5, scale: 2 }).notNull(),
    maxYieldPercentAtEvaluation: numeric("max_yield_percent_at_evaluation", { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedById: text("reviewed_by_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
  },
  (table) => [
    uniqueIndex("cutting_yield_deviations_production_unique").on(table.cuttingProductionId),
    index("cutting_yield_deviations_unreviewed_idx").on(table.reviewedAt),
    check("cutting_yield_deviations_review_pairing", sql`(${table.reviewedById} is null) = (${table.reviewedAt} is null) and (${table.reviewedById} is null) = (${table.reviewReason} is null)`),
  ]
);
