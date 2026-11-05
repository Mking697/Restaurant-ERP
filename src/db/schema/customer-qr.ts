import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customers } from "./customers";
import { users } from "./auth";

export const customerQrTokenStatusEnum = pgEnum("customer_qr_token_status", ["ACTIVE", "REVOKED"]);

/**
 * GAP-040: an opaque, revocable membership-lookup token — the QR code
 * itself encodes ONLY the raw random token string below (see
 * src/lib/server/customer-qr.ts), never a phone number, name, or any
 * session/login credential. Possessing/scanning this token identifies a
 * member; it does NOT itself authorize a reward redemption or any other
 * high-value action — that is always a separate, independently-authorized
 * staff action (see GAP-039's redeemPoints, called with its own module
 * check after the member has been identified this way).
 * tokenHash is sha256 of the raw token (same convention as
 * src/lib/server/auth.ts's own session tokenHash) — the raw token is
 * returned to the issuing staff member exactly once at issuance time and
 * is never stored in plain text anywhere, including here.
 * At most ONE ACTIVE token per customer at a time (partial unique index
 * below) — issuing a replacement implicitly revokes the previous one
 * (see issueMemberQrToken), so a lost/leaked QR is invalidated simply by
 * re-issuing, with zero separate "revoke" step required (though an
 * explicit revoke-without-replacement action also exists).
 */
export const customerQrTokens = pgTable(
  "customer_qr_tokens",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    tokenHash: text("token_hash").notNull(),
    status: customerQrTokenStatusEnum("status").notNull().default("ACTIVE"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedBy: text("issued_by")
      .notNull()
      .references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("customer_qr_tokens_token_hash_unique").on(table.tokenHash),
    uniqueIndex("customer_qr_tokens_one_active_per_customer").on(table.customerId).where(sql`${table.status} = 'ACTIVE'`),
    index("customer_qr_tokens_customer_id_idx").on(table.customerId),
  ]
);
