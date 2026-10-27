import { sql } from "drizzle-orm";
import { check, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { menuItems } from "./menu";
import { users } from "./auth";

export interface ProductionSnapshot {
  name: string;
  unit: string;
  quantity: string;
  // qtyPerUnit is normalized per ONE output unit. Deductions reflect the
  // actual stock precision rounding, not a later re-explosion of this recipe.
  recipe: { id: string; componentType: string; rawMaterialId: string | null; componentMenuItemId: string | null; qtyPerUnit: string; name: string; unit: string }[];
  inventoryDeducted: { rawMaterialId: string; qtyDeducted: string }[];
  semiFgDeducted: { menuItemId: string; qtyDeducted: string }[];
}
export const semiFgStock = pgTable("semi_fg_stock", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
  qtyOnHand: numeric("qty_on_hand", { precision: 12, scale: 3 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("semi_fg_stock_branch_menu_unique").on(table.branchId, table.menuItemId),
  check("semi_fg_stock_nonnegative", sql`${table.qtyOnHand} >= 0`),
]);

// Append-only through the production API; replay always returns this historical
// snapshot even if a recipe/name/unit has since changed. No update/delete route.
export const semiFgProductions = pgTable("semi_fg_productions", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  snapshot: jsonb("snapshot").$type<ProductionSnapshot>().notNull(),
  producedById: text("produced_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("semi_fg_productions_branch_key_unique").on(table.branchId, table.idempotencyKey),
  index("semi_fg_productions_branch_created_idx").on(table.branchId, table.createdAt),
  check("semi_fg_productions_positive", sql`${table.quantity} > 0`),
]);
