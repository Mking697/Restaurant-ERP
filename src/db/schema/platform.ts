import { boolean, index, integer, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const branchOperatingConceptEnum = pgEnum("branch_operating_concept", ["FAST_FOOD", "CONVENTIONAL"]);

/**
 * Tenancy root. One row per branch, B1..B6+ — scales to N branches without a
 * schema change. isTemplate/clonedFromId back the Clone Branch Wizard: cloning
 * is a row-copy of MenuItems/BomRecipes/ChecklistTemplates into a new branchId,
 * not a schema change.
 */
export const branches = pgTable(
  "branches",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(), // "B1".."B6"
    address: text("address").notNull().default(""),
    operatingConcept: branchOperatingConceptEnum("operating_concept").notNull().default("FAST_FOOD"),
    // Tanzania VAT is a flat national rate (18% standard, TRA) — no state/
    // CGST-SGST-IGST concept exists here. This column is an OPTIONAL
    // branch-level override of that flat rate (e.g. a branch not VAT
    // registered, or a special zone) — null means "use each menu item's
    // own vatRatePercent (defaults 18.00)". See src/lib/server/vat.ts.
    vatRatePercent: numeric("vat_rate_percent", { precision: 5, scale: 2 }),
    lat: numeric("lat").notNull(),
    lng: numeric("lng").notNull(),
    geofenceRadiusM: integer("geofence_radius_m").notNull().default(50),
    isTemplate: boolean("is_template").notNull().default(false),
    clonedFromId: text("cloned_from_id"),
    // Per-branch brand override (e.g. a chain running two distinct brands,
    // like a Fast Food chain + a separately-branded Dine-in Bar, under one
    // shared ERP). Null means "use the global Restaurant Branding settings"
    // — same optional-override convention as vatRatePercent above. Stored as
    // base64 PNG (same convention as settings.RESTAURANT_LOGO), not a Blob
    // URL — logos are small (<=128KB post-normalize) and this avoids a new
    // storage dependency.
    brandName: text("brand_name"),
    brandLogo: text("brand_logo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("branches_code_idx").on(table.code)]
);
