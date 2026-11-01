import { sql } from "drizzle-orm";
import { boolean, check, date, index, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { warehouses } from "./warehouses";
import { branches } from "./platform";
import { rawMaterials } from "./menu";
import { users } from "./auth";

export const inventoryStock = pgTable(
  "inventory_stock",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    qtyOnHand: numeric("qty_on_hand", { precision: 12, scale: 3 }).notNull(),
    // Per-branch par levels — different branches sell different volumes, so
    // these live here (not on rawMaterials, which is a global catalog row).
    // Low-stock alert fires when qtyOnHand < minStockLevel; overstock alert
    // fires when qtyOnHand > maxStockLevel. Either can be 0/unset (treated as
    // "no alert configured yet" at the application layer, not "alert always").
    minStockLevel: numeric("min_stock_level", { precision: 12, scale: 3 }).notNull().default("0"),
    maxStockLevel: numeric("max_stock_level", { precision: 12, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Real uniqueness guard (upgraded from a plain non-unique index) — without
  // this, two concurrent "upsert stock row" writers (e.g. two GRN postings
  // landing near-simultaneously for the same branch+material) could both
  // read-no-row then insert, silently splitting one material's qtyOnHand
  // across two rows. production.ts's deductStock() already fails closed on
  // an application-level duplicate (see its own comment there) — this closes
  // the gap at the database level so a duplicate can no longer be created.
  (table) => [uniqueIndex("inventory_stock_branch_raw_unique").on(table.branchId, table.rawMaterialId)]
);

export const stockBatches = pgTable(
  "stock_batches",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").references(() => branches.id),
    warehouseId: text("warehouse_id").references(() => warehouses.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    batchNo: text("batch_no").notNull(),
    qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }).notNull(),
    qtyRemaining: numeric("qty_remaining", { precision: 12, scale: 3 }).notNull(), // FIFO draw-down
    expiryDate: date("expiry_date"),
    // Legacy nulls remain UNKNOWN, never auto-classified as non-expiring.
    expiryStatus: text("expiry_status").$type<"UNKNOWN" | "DATED" | "NON_EXPIRING">().notNull().default("UNKNOWN"),
    originBatchId: text("origin_batch_id"),
    grnLineId: text("grn_line_id").notNull().default(""),
    // GAP-010: real per-kg vendor cost, snapshotted at credit time, never
    // retroactively recomputed from a later rate/BOM edit. Set from the
    // GRN line's accepted rate on a real purchase credit; preserved (not
    // reset) across a transfer receive, since it is the SAME lot's cost
    // carried to a new location. Left NULL ("unknown cost") on opening
    // stock, physical-count surplus, wastage/night-variance reconciliation
    // and Owner batch-reconcile credits — GAP-010's actual-cutting costing
    // fails closed (409) rather than guessing a cost for such a lot.
    unitCostTsh: numeric("unit_cost_tsh", { precision: 12, scale: 4 }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_batches_branch_raw_idx").on(table.branchId, table.rawMaterialId),
    index("stock_batches_warehouse_raw_idx").on(table.warehouseId, table.rawMaterialId),
    check("stock_batches_location_xor", sql`(${table.branchId} is not null) <> (${table.warehouseId} is not null)`),
    check("stock_batches_expiry_valid", sql`(${table.expiryStatus} = 'UNKNOWN') or (${table.expiryStatus} = 'DATED' and ${table.expiryDate} is not null) or (${table.expiryStatus} = 'NON_EXPIRING' and ${table.expiryDate} is null)`),
    index("stock_batches_expiry_idx").on(table.expiryDate), // 48h-before-expiry WhatsApp alert cron
  ]
);

export const wastageLogs = pgTable(
  "wastage_logs",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    batchId: text("batch_id").notNull().default(""),
    qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
    reason: text("reason").notNull(), // "expired" | "dropped" | "burnt"
    photoUrl: text("photo_url").notNull(), // mandatory proof
    loggedById: text("logged_by_id")
      .notNull()
      .references(() => users.id),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("wastage_logs_branch_id_idx").on(table.branchId)]
);

export const nightVarianceEntries = pgTable(
  "night_variance_entries",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    shiftDate: date("shift_date").notNull(),
    theoreticalQty: numeric("theoretical_qty", { precision: 12, scale: 3 }).notNull(), // BOM auto-deduction
    physicalQty: numeric("physical_qty", { precision: 12, scale: 3 }).notNull(), // chef-submitted count
    varianceQty: numeric("variance_qty", { precision: 12, scale: 3 }).notNull(),
    varianceValueInr: numeric("variance_value_inr", { precision: 12, scale: 2 }).notNull(),
    chefOnDutyId: text("chef_on_duty_id")
      .notNull()
      .references(() => users.id),
    flaggedPilferage: boolean("flagged_pilferage").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("night_variance_branch_shift_idx").on(table.branchId, table.shiftDate)]
);
