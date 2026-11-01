import { sql } from "drizzle-orm";
import { check, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { menuItems } from "./menu";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// GAP-009 (November 2026). "Actual Cutting" mode — a SEPARATE production
// path from the existing Fixed-BOM src/db/schema/production.ts
// (semiFgProductions/semiFgStock, UNCHANGED by this GAP). The operator picks
// per production EVENT which mode to use (no per-item flag, per Owner
// decision) — both remain always available for every Semi-FG item.
//
// Fixed-BOM derives required inputs FROM a planned output quantity via the
// recipe ratio. Actual Cutting is the opposite: the operator records the
// REAL measured input consumed and REAL measured output (pieces and/or
// mass) plus trim/waste — yield is DERIVED from what actually happened,
// never assumed from a recipe ratio.
//
// Scope restriction (Owner decision): every raw-material input in this
// pass must be in "kg" (see rawMaterials.unit) — a non-mass unit (ltr, pcs,
// ...) is rejected outright, so conservation math never silently mixes
// incompatible units. inputs is a snapshot (immutable even if a raw
// material is later renamed/reunited) of what was actually consumed,
// stock-batch-allocated the same hard-blocked FEFO way as every other real
// RAW consumption (src/lib/server/stock-batches.ts, allowExpired: false).
//
// Conservation (src/lib/server/cutting-production.ts enforces both):
//   1. HARD physical rule, no tolerance ever: outputMassKg + wasteQtyKg
//      can never exceed inputTotalKg — mass cannot be created by cutting.
//   2. Tolerance rule: the unaccounted loss percentage, (inputTotalKg -
//      outputMassKg - wasteQtyKg) / inputTotalKg * 100, must be <= the
//      Owner's costYieldTolerancePercent (src/lib/server/business-policy.ts
//      — this field already existed, reserved by its own comment for this
//      GAP; reused here rather than inventing a second setting). Unset
//      tolerance means this GAP is not yet configured and every Actual
//      Cutting submission is rejected — fail closed, never a guessed %.
// tolerancePercentAtSubmission freezes the Owner's setting used for THIS
// record, so a later policy change never retroactively makes a past,
// compliant record look wrong.
//
// outputQty is denominated in the output item's own menuItems.outputUnit
// (pcs, kg, ...) — outputUnitAtSubmission snapshots that unit so a later
// catalog edit can't reinterpret a historical record's quantity. When the
// output unit is exactly "pcs", outputQty must be a whole number (no
// fractional pieces); outputMassKg is then a SEPARATE real measurement
// used only for the mass-conservation check above, since pieces and
// kilograms are not directly comparable. When the output unit already IS
// "kg", outputMassKg is redundant with outputQty and may be omitted — the
// server treats outputQty as the mass in that case.
// ---------------------------------------------------------------------------

export interface CuttingInputLine { rawMaterialId: string; name: string; qtyKg: string; }

// ---------------------------------------------------------------------------
// GAP-010 (November 2026). Actual production-lot cost, scoped THIS PASS to
// Actual Cutting only (Owner decision) — the existing Fixed-BOM path keeps
// its planning-estimate recipe-at-sale COGS unchanged (src/lib/server/
// cogs.ts), never relabeled as a real lot cost.
//
// inputTotalValueTsh is the EXACT sum, over every stock-batch lot actually
// drawn from (the same FEFO allocation already used for the real debit),
// of qtyDrawnFromThatLot * thatLot's own stockBatches.unitCostTsh. Rounded
// ONCE at this final aggregate step (never per-line) to keep money exact
// per the Owner's own stated rule. If ANY lot drawn from has an unknown
// unitCostTsh (NULL — opening stock, a count/variance surplus, or an
// Owner batch-reconcile credit never carried a real rate), the whole
// submission fails closed (409) rather than silently costing it as free
// or guessing a rate — see src/lib/server/cutting-production.ts.
//
// costPerOutputUnitTsh is a DERIVED display figure (inputTotalValueTsh /
// outputQty) for THIS record only — downstream consumption (POS sale,
// transfer-out of the output) does NOT yet carry this valuation forward;
// that is explicitly out of this pass's scope (Owner decision) and is a
// separate future gap, not silently assumed here.
// ---------------------------------------------------------------------------

export const actualCuttingProductions = pgTable(
  "actual_cutting_productions",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    inputs: jsonb("inputs").notNull().$type<CuttingInputLine[]>(),
    inputTotalKg: numeric("input_total_kg", { precision: 12, scale: 3 }).notNull(),
    outputQty: numeric("output_qty", { precision: 12, scale: 3 }).notNull(),
    outputUnitAtSubmission: text("output_unit_at_submission").notNull(),
    outputMassKg: numeric("output_mass_kg", { precision: 12, scale: 3 }).notNull(),
    wasteQtyKg: numeric("waste_qty_kg", { precision: 12, scale: 3 }).notNull().default("0"),
    unaccountedLossPercent: numeric("unaccounted_loss_percent", { precision: 6, scale: 3 }).notNull(),
    tolerancePercentAtSubmission: numeric("tolerance_percent_at_submission", { precision: 5, scale: 2 }).notNull(),
    inputTotalValueTsh: numeric("input_total_value_tsh", { precision: 14, scale: 2 }).notNull(),
    costPerOutputUnitTsh: numeric("cost_per_output_unit_tsh", { precision: 14, scale: 2 }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    producedById: text("produced_by_id").notNull().references(() => users.id),
    producedAt: timestamp("produced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("actual_cutting_productions_idempotency_unique").on(table.branchId, table.idempotencyKey),
    index("actual_cutting_productions_branch_item_idx").on(table.branchId, table.menuItemId),
    check("actual_cutting_output_mass_conserved", sql`${table.outputMassKg} + ${table.wasteQtyKg} <= ${table.inputTotalKg}`),
  ]
);
