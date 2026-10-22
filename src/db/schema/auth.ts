import { boolean, index, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { branches } from "./platform";

/**
 * Role vocabulary — closed, kept as pgEnum (unlike Pro ERP's `role` which is
 * open text; this project's role set is fixed by the brief).
 */
export const roleEnum = pgEnum("role", [
  "SUPER_ADMIN", // Owner/HQ — all branches, compiled + drill-down
  "CENTRAL_STORE_MGR", // raises/approves POs & indents across branches
  "BRANCH_MANAGER", // single branch scope
  "CASHIER", // POS + blind cash drop
  "KITCHEN_STAFF", // recurring tasks, night variance submission
]);

export const userStatusEnum = pgEnum("user_status", ["Active", "Inactive"]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phoneE164: text("phone_e164").notNull().unique(), // WhatsApp identity, zero-login
    role: roleEnum("role").notNull(),
    branchId: text("branch_id").references(() => branches.id), // null for SUPER_ADMIN/CENTRAL_STORE_MGR
    passwordHash: text("password_hash"), // only for web dashboard logins (HQ/managers)
    status: userStatusEnum("status").notNull().default("Active"),
    // Granular per-module access on top of `role` — see src/lib/moduleAccess.ts.
    moduleAccess: text("module_access").array().notNull().default([]),
    // Leave/escalation approval chain first stop; plain text, not FK-enforced
    // (matches every other cross-entity reference in this schema).
    reportingManagerId: text("reporting_manager_id").notNull().default(""),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    // Bumped on every role/status/moduleAccess change or password reset, baked
    // into the session JWT — so a revoked/downgraded user's existing cookie
    // stops working immediately instead of staying valid for its full TTL.
    tokenVersion: numeric("token_version").notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default(""),
  },
  (table) => [index("users_branch_id_idx").on(table.branchId)]
);

// Opaque tokens are only stored as SHA-256 digests; raw tokens live in cookies.
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenVersion: numeric("token_version").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sessions_user_id_idx").on(table.userId), index("sessions_expires_at_idx").on(table.expiresAt)]);
