import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic app-configuration key/value store — ChatXFlow token, WhatsApp
 * phone number, base URL, etc. Mirrors Pro ERP's `settings` table (one row
 * per key). Unlike Pro ERP (multi-tenant SaaS, settings scoped per org),
 * this restaurant chain is a single tenant with multiple branches, so
 * settings are GLOBAL (one WhatsApp business number for the whole HQ) —
 * no orgId/branchId column needed. If a future requirement needs a
 * *branch-specific* override, add a nullable branchId then, don't
 * pre-guess it now.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(), // e.g. "CHATXFLOW_API_TOKEN"
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
