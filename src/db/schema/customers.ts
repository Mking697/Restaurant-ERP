import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";

export const customerStatusEnum = pgEnum("customer_status", ["ACTIVE", "MERGED"]);

/**
 * GAP-038: a stable customer membership identity — deliberately GLOBAL
 * (shared across every branch and operating concept, owner decision this
 * session), NOT a per-branch record. phone is the normalized bare 9-digit
 * Tanzanian mobile (same convention as posOrders.customerPhone) and is
 * UNIQUE — this is what resolves a concurrent double-registration race to
 * one row (see findOrCreateCustomer in src/lib/server/customers.ts) instead
 * of two. createdBranchId is only ever "which branch first registered this
 * person" — it does NOT scope who may look them up (any branch's cashier
 * may search/select any ACTIVE member globally), only who may EDIT/MERGE
 * them (Branch Manager: their own branch's created members; Owner: any —
 * owner decision this session, see src/lib/server/customers.ts).
 * Consent/opt-out is NOT duplicated here — it is read live from the
 * existing whatsapp_opt_outs table (GAP-037), keyed by the same phone, so
 * there is exactly one source of truth for "may we message this person."
 * Merely capturing a phone/name on a pos_orders row never creates or
 * touches a row here — membership only exists because staff explicitly
 * registered it (see POST /api/customers).
 */
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    createdBranchId: text("created_branch_id")
      .notNull()
      .references(() => branches.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    status: customerStatusEnum("status").notNull().default("ACTIVE"),
    // Set only when status = MERGED — the surviving record this one was
    // folded into. Never pointed at itself; never re-pointed once set
    // (an already-merged record cannot be merged again) — enforced in
    // src/lib/server/customers.ts, not by a DB constraint.
    mergedIntoId: text("merged_into_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("customers_phone_unique").on(table.phone),
    index("customers_created_branch_id_idx").on(table.createdBranchId),
  ]
);
