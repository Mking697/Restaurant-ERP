import { boolean, index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
    // GST state code (2-digit, e.g. "07" = Delhi) — compared against the
    // company's registered GSTIN state (settings key GST_HOME_STATE_CODE) to
    // decide CGST+SGST (same state) vs IGST (different state) on an invoice.
    // Empty means "not configured yet"; see src/lib/server/gst.ts.
    gstStateCode: text("gst_state_code").notNull().default(""),
    lat: numeric("lat").notNull(),
    lng: numeric("lng").notNull(),
    geofenceRadiusM: integer("geofence_radius_m").notNull().default(50),
    isTemplate: boolean("is_template").notNull().default(false),
    clonedFromId: text("cloned_from_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("branches_code_idx").on(table.code)]
);
