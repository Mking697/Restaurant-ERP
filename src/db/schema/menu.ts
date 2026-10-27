import { boolean, check, index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
    // Semi-FG (base gravy/sauce/marinade): own recipe, not sold directly to a
    // customer. isSellable false keeps it off the customer menu while it can
    // still be referenced as a BOM component of other dishes (see bomRecipes
    // below). Both flags are independent — a branch could in theory sell a
    // semi-FG item directly (e.g. a takeaway gravy jar), so this is not
    // collapsed into one column.
    isSemiFg: boolean("is_semi_fg").notNull().default(false),
    isSellable: boolean("is_sellable").notNull().default(true),
    // GST — restaurant HSN/SAC + slab rate per item (5/12/18 typically differ
    // by AC/non-AC/liquor). Empty/0 means "not configured yet"; the invoice
    // layer (not built yet) must refuse to bill an unconfigured item, not
    // silently charge 0% tax — see src/lib/server/gst.ts.
    hsnSacCode: text("hsn_sac_code").notNull().default(""),
    gstRatePercent: numeric("gst_rate_percent", { precision: 5, scale: 2 }).notNull().default("5.00"),
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

// ---------------------------------------------------------------------------
// BOM COMPONENT TYPE — a recipe row's component is EITHER a raw material OR
// another menu_item that is itself a Semi-FG (isSemiFg = true), never both
// and never neither. This makes the BOM tree recursive: a final dish can
// reference a semi-FG (e.g. "Butter Chicken Gravy"), and that semi-FG has
// its own bom_recipes rows pointing at raw materials (or a deeper semi-FG).
// Order-confirm explosion walks this tree to the raw-material leaves — see
// src/lib/server/bom.ts (explodeBom / computeRecipeCost). Cycle prevention
// (a dish can never depend on itself, directly or transitively) is an
// API-layer rule (assertAcyclicInsert in that same file), not a DB
// constraint — Postgres has no portable recursive-FK cycle check.
// ---------------------------------------------------------------------------

export const bomComponentTypeEnum = pgEnum("bom_component_type", ["RAW_MATERIAL", "SEMI_FG"]);

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
    componentType: bomComponentTypeEnum("component_type").notNull().default("RAW_MATERIAL"),
    // Exactly one of these two is set, enforced by the check constraint below
    // and re-validated at the API layer (parseBomRow in src/lib/server/bom.ts).
    rawMaterialId: text("raw_material_id").references(() => rawMaterials.id),
    componentMenuItemId: text("component_menu_item_id").references(() => menuItems.id),
    qtyPerUnit: numeric("qty_per_unit", { precision: 10, scale: 3 }).notNull(), // in the component's own UOM, per 1 unit of menuItemId sold/produced
    lockedByHq: boolean("locked_by_hq").notNull().default(true), // branch cannot edit when true
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bom_recipes_branch_menu_raw_unique").on(
      table.branchId,
      table.menuItemId,
      table.rawMaterialId
    ),
    uniqueIndex("bom_recipes_branch_menu_component_unique").on(
      table.branchId,
      table.menuItemId,
      table.componentMenuItemId
    ),
    index("bom_recipes_branch_id_idx").on(table.branchId),
    index("bom_recipes_component_menu_item_idx").on(table.componentMenuItemId),
    check(
      "bom_recipes_component_xor",
      sql`(${table.componentType} = 'RAW_MATERIAL' and ${table.rawMaterialId} is not null and ${table.componentMenuItemId} is null) or (${table.componentType} = 'SEMI_FG' and ${table.componentMenuItemId} is not null and ${table.rawMaterialId} is null and ${table.componentMenuItemId} <> ${table.menuItemId})`
    ),
  ]
);
