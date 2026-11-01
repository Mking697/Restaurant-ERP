import { index, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { warehouses } from "./warehouses";
import { rawMaterials } from "./menu";

// ---------------------------------------------------------------------------
// WAREHOUSE STOCK — GAP-004 follow-up slice: the real tracked raw-material
// balance for a warehouse row (today only meaningful for CENTRAL warehouses
// — BRANCH warehouses' real stock stays in inventory_stock, keyed by
// branchId, as warehouses.ts's own comment already flags; this table does
// NOT change that). Before this table existed, src/app/api/stock-transfers's
// dispatch route explicitly could not debit anything real ("central
// warehouse stock has no quantity ledger yet in this schema" — see its own
// comment, now resolved for CENTRAL warehouses specifically).
//
// Credited by: POST /api/warehouses/[id]/stock-in (Owner/INVENTORY-gated,
// CENTRAL warehouses only — the one real "opening/receipt" writer this
// slice adds). Debited by: stock-transfer dispatch (POST /api/stock-transfers),
// atomically, under a row lock, rejecting insufficient balance (409) —
// this is what actually prevents overselling central stock.
// Explicitly NOT covered by this slice: BRANCH-type warehouse balances,
// any link between this table and inventory_stock's branch balances beyond
// the existing transfer-receive credit, and non-CENTRAL stock-in.
// ---------------------------------------------------------------------------

export const warehouseStock = pgTable(
  "warehouse_stock",
  {
    id: text("id").primaryKey(),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    qtyOnHand: numeric("qty_on_hand", { precision: 12, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("warehouse_stock_warehouse_id_idx").on(table.warehouseId),
    unique("warehouse_stock_warehouse_material_unique").on(table.warehouseId, table.rawMaterialId),
  ]
);
