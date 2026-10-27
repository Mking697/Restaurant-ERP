import { index, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { rawMaterials } from "./menu";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// WAREHOUSE — 2-level stock model (per the process-flow roadmap): one or
// more CENTRAL warehouses (bulk, not branch-scoped) feed each branch's own
// local store (type BRANCH, branchId set). This table is schema groundwork
// only this pass — inventory_stock (src/db/schema/inventory.ts) still keys
// stock by branchId directly, NOT by warehouseId yet. Wiring inventory_stock
// to a real warehouseId (and updating the POS order-confirm deduction path
// in src/app/api/pos/orders/route.ts accordingly) is a separate follow-up —
// don't assume stock is warehouse-scoped anywhere until that lands.
// ---------------------------------------------------------------------------

export const warehouseTypeEnum = pgEnum("warehouse_type", ["CENTRAL", "BRANCH"]);

export const warehouses = pgTable(
  "warehouses",
  {
    id: text("id").primaryKey(),
    type: warehouseTypeEnum("type").notNull(),
    // Set for BRANCH warehouses, null for CENTRAL ones (a central warehouse
    // is not owned by any single branch).
    branchId: text("branch_id").references(() => branches.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("warehouses_branch_id_idx").on(table.branchId)]
);

// ---------------------------------------------------------------------------
// STOCK TRANSFER — central-to-branch (or branch-to-branch) movement of a raw
// material, dispatch-then-receive verified same as the existing 3-way-match
// GRN pattern (purchase.ts) so shrinkage/pilferage in transit is traceable
// the same way a vendor delivery is. qtyReceived can differ from qtyDispatched
// (damage/shortage in transit) — that variance is the whole point of the
// 2-step verify, mirroring grnLines.qtyFailed in purchase.ts.
// ---------------------------------------------------------------------------

export const stockTransferStatusEnum = pgEnum("stock_transfer_status", ["DISPATCHED", "RECEIVED", "CANCELLED"]);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: text("id").primaryKey(),
    fromWarehouseId: text("from_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    toWarehouseId: text("to_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    qtyDispatched: numeric("qty_dispatched", { precision: 12, scale: 3 }).notNull(),
    qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }), // null until received
    status: stockTransferStatusEnum("status").notNull().default("DISPATCHED"),
    dispatchedById: text("dispatched_by_id")
      .notNull()
      .references(() => users.id),
    receivedById: text("received_by_id").references(() => users.id),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
  },
  (table) => [
    index("stock_transfers_from_idx").on(table.fromWarehouseId),
    index("stock_transfers_to_idx").on(table.toWarehouseId),
  ]
);
