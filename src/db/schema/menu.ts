import { boolean, index, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";

export const menuItems = pgTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    name: text("name").notNull(),
    category: text("category").notNull().default(""),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("menu_items_branch_id_idx").on(table.branchId)]
);

export const rawMaterials = pgTable("raw_materials", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  unit: text("unit").notNull(), // UOM — g, ml, pcs, kg, ltr, box, etc.
  category: text("category").notNull().default(""),
  isHighValue: boolean("is_high_value").notNull().default(false), // Top-20 night variance watchlist
  shelfLifeDays: numeric("shelf_life_days"),
});

export const bomRecipes = pgTable(
  "bom_recipes",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    qtyPerUnit: numeric("qty_per_unit", { precision: 10, scale: 3 }).notNull(), // g/ml per 1 item sold
    lockedByHq: boolean("locked_by_hq").notNull().default(true), // branch cannot edit when true
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bom_recipes_branch_menu_raw_unique").on(
      table.branchId,
      table.menuItemId,
      table.rawMaterialId
    ),
    index("bom_recipes_branch_id_idx").on(table.branchId),
  ]
);
