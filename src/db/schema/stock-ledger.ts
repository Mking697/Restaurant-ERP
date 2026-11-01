import { check, index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "./platform";
import { rawMaterials, menuItems } from "./menu";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// GAP-004 (central warehouse stock ledger). Branch-scoped movements for the
// writers wired so far:
//   - GRN quality PASS/PARTIAL accepted-stock credit (grn-quality.ts) — RAW
//   - deductStock's raw-material debit (production.ts; POS sale + Semi-FG
//     production both call it) — RAW
//   - deductStock's Semi-FG debit (production.ts; a dish recipe consuming a
//     prepared item) — SEMI_FG
//   - produceSemiFg's Semi-FG credit (production.ts) — SEMI_FG
//
// Exactly one of rawMaterialId/menuItemId is set, matching itemType — same
// "exactly one of two nullable columns" convention as purchaseOrderLines'
// rawMaterialId/itemDescription. Enforced by the CHECK constraint below AND
// by src/lib/server/stock-ledger.ts's postStockMovement (the only writer).
//
// This table is an AUDITED PARALLEL RECORD, not yet the authoritative
// balance. inventory_stock.qtyOnHand / semi_fg_stock.qtyOnHand remain the
// live source of truth for every reader; this ledger exists so those can be
// proven to agree (see ledgerBalance()), the prerequisite before any future
// cutover. Per this project's "no half-migrated ledger" rule, the following
// are explicitly NOT wired yet: central (non-branch) warehouse RAW balances
// (see warehouse-stock.ts instead — a separate, non-ledger balance table),
// stock-transfer dispatch/receive, wastage write-offs, physical-count
// adjustments. Do not read this table as a complete stock history.
// ---------------------------------------------------------------------------

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "GRN_RECEIPT", // GRN quality PASS/PARTIAL accepted-stock credit (RAW)
  "PRODUCTION_CONSUME", // deductStock's raw-material debit (RAW)
  "PRODUCTION_OUTPUT", // produceSemiFg's Semi-FG credit (SEMI_FG)
  "SEMI_FG_CONSUME", // deductStock's Semi-FG debit, e.g. a dish using a prepared item (SEMI_FG)
  "WASTAGE_WRITE_OFF", // logWastage's debit (RAW) — expired/dropped/burnt stock
  "PHYSICAL_COUNT_ADJUST", // submitNightVariance's signed adjustment to the real counted qty (RAW)
]);

export const stockItemTypeEnum = pgEnum("stock_item_type", ["RAW_MATERIAL", "SEMI_FG"]);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    itemType: stockItemTypeEnum("item_type").notNull(),
    // Exactly one of these two is set, matching itemType — see the CHECK below.
    rawMaterialId: text("raw_material_id").references(() => rawMaterials.id),
    menuItemId: text("menu_item_id").references(() => menuItems.id), // the Semi-FG item, when itemType = SEMI_FG
    movementType: stockMovementTypeEnum("movement_type").notNull(),
    // Signed: positive = credit/increase, negative = debit/decrease. Same
    // numeric(12,3) convention as inventory_stock/semi_fg_stock.qtyOnHand.
    qtyDelta: numeric("qty_delta", { precision: 12, scale: 3 }).notNull(),
    // Deterministic per (sourceType, sourceId, rawMaterialId ?? menuItemId) —
    // a retried request for the same business event can never post the same
    // movement twice. Globally unique (not per-branch) since sourceId
    // already uniquely identifies the originating row.
    idempotencyKey: text("idempotency_key").notNull(),
    sourceType: text("source_type").notNull(), // "GRN" | "PRODUCTION" | "POS_ORDER"
    sourceId: text("source_id").notNull(), // the originating row's id
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_movements_idempotency_unique").on(table.idempotencyKey),
    index("stock_movements_branch_raw_idx").on(table.branchId, table.rawMaterialId),
    index("stock_movements_branch_menu_item_idx").on(table.branchId, table.menuItemId),
    check(
      "stock_movements_exactly_one_item_ref",
      sql`(${table.itemType} = 'RAW_MATERIAL' AND ${table.rawMaterialId} IS NOT NULL AND ${table.menuItemId} IS NULL) OR (${table.itemType} = 'SEMI_FG' AND ${table.menuItemId} IS NOT NULL AND ${table.rawMaterialId} IS NULL)`
    ),
  ]
);
