import { boolean, index, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { rawMaterials } from "./menu";
import { branches } from "./platform";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// GAP-015 (November 2026). Approved vendor onboarding and enforcement.
//
// Owner decisions (confirmed via clarify):
//   1. Owner-only to approve or suspend a vendor.
//   2. Simple applicability: ONE approval scope per vendor — an optional
//      single branch restriction (NULL = all branches) and an optional
//      single category restriction (NULL = all categories), not a
//      multi-row join. Vendor creation alone is never approval — status
//      defaults to DRAFT for every NEW vendor from this point forward.
//   3. One-time cutover (this migration's own data UPDATE, not the column
//      DEFAULT): every vendor that already existed BEFORE this migration
//      ran is backfilled to APPROVED (unrestricted) so existing purchasing
//      is never silently halted. A vendor created AFTER this migration
//      always starts DRAFT and needs an explicit Owner approval.
// ---------------------------------------------------------------------------
export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phoneE164: text("phone_e164").notNull().unique(), // vendor WhatsApp portal identity
  email: text("email").notNull().default(""),
  tin: text("tin").notNull().default(""), // Tanzania TRA Taxpayer Identification Number
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").$type<"DRAFT" | "APPROVED" | "SUSPENDED">().notNull().default("DRAFT"),
  approvedBranchId: text("approved_branch_id").references(() => branches.id),
  approvedCategory: text("approved_category"),
});

// Append-only review history — every approve/suspend action, who, when and
// why, plus a snapshot of the scope decided at that moment. Historical
// documents (POs already created) keep their own vendorId regardless of
// what this table or vendors.status says later — this table never rewrites
// a past purchase's vendor identity.
export const vendorReviewEvents = pgTable(
  "vendor_review_events",
  {
    id: text("id").primaryKey(),
    vendorId: text("vendor_id").notNull().references(() => vendors.id),
    action: text("action").$type<"APPROVE" | "SUSPEND">().notNull(),
    actorId: text("actor_id").notNull().references(() => users.id),
    reason: text("reason").notNull().default(""),
    branchIdAtReview: text("branch_id_at_review").references(() => branches.id),
    categoryAtReview: text("category_at_review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("vendor_review_events_vendor_idx").on(table.vendorId)]
);

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
