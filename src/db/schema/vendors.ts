import { boolean, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { rawMaterials } from "./menu";

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phoneE164: text("phone_e164").notNull().unique(), // vendor WhatsApp portal identity
  email: text("email").notNull().default(""),
  tin: text("tin").notNull().default(""), // Tanzania TRA Taxpayer Identification Number
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vendorRates = pgTable(
  "vendor_rates",
  {
    id: text("id").primaryKey(),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id),
    rawMaterialId: text("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    rate: numeric("rate", { precision: 10, scale: 2 }).notNull(),
    lockedByUserId: text("locked_by_user_id").notNull().default(""), // SUPER_ADMIN who locked it
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [uniqueIndex("vendor_rates_vendor_raw_unique").on(table.vendorId, table.rawMaterialId)]
);
