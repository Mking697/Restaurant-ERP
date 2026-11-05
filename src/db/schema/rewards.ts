import { index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { users } from "./auth";
import { customers } from "./customers";
import { posOrders } from "./pos";

export const rewardEventTypeEnum = pgEnum("reward_event_type", ["EARN", "REDEEM", "EXPIRE", "REVERSE"]);

/**
 * GAP-039 — Owner-approved policy, recorded November 2026 (do not change
 * without a fresh explicit approval — see docs/gap039-verification.md):
 *   - Eligibility: every PAID/COMPLETED order, no minimum amount.
 *   - Earn rate: 1 point per TSh 1,000 spent (floor division; a TSh 1,999
 *     order earns 1 point, not 2 — never rounds up).
 *   - Redeem value: 1 point = TSh 50 discount, snapshotted onto the REDEEM
 *     event's amountTsh at the time of redemption (never recomputed from a
 *     possibly-later-changed rate).
 *   - Expiry: 12 months from each EARN event's own createdAt (FIFO — the
 *     OLDEST still-unconsumed points expire first; a later top-up earn
 *     never "resets" an older one's own expiry clock).
 *   - Accounting: a redemption is a discount reducing revenue directly, not
 *     a separate marketing expense line (owner decision; the actual
 *     Accounts/VAT wiring is a deliberately deferred follow-on — see the
 *     verification doc's explicit limits).
 *
 * This table is an append-only ledger — a balance is ALWAYS derived by
 * replaying every event for a customer (see rewardBalance in
 * src/lib/server/rewards.ts), never read from an independently mutable
 * "points" field anywhere. EARN/REDEEM/EXPIRE/REVERSE rows are never
 * updated or deleted once inserted.
 */
export const rewardEvents = pgTable(
  "reward_events",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    type: rewardEventTypeEnum("type").notNull(),
    // Always a positive magnitude — the signed effect on balance is derived
    // from `type` (EARN/REVERSE-of-REDEEM: +; REDEEM/EXPIRE/REVERSE-of-EARN: -),
    // never stored as a signed column (one less way for a future change to
    // silently flip a sign without the derivation logic noticing).
    points: integer("points").notNull(),
    // Only set for EARN — the order that earned these points. UNIQUE (NULL-
    // safe: only EARN rows ever set this) so a retried order-creation
    // request can never post a second earn for the same order.
    sourceOrderId: text("source_order_id").references(() => posOrders.id),
    // Only set for EARN — this specific lot's own 12-month expiry deadline,
    // computed once at earn time and frozen (a later policy change never
    // retroactively moves an already-earned lot's expiry).
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Only set for REDEEM (and its REVERSE) — the TSh value at the rate in
    // effect when the redemption was made.
    amountTsh: numeric("amount_tsh", { precision: 10, scale: 2 }),
    // Only set for REVERSE — which earlier event this one reverses. UNIQUE:
    // an event can be reversed at most once.
    reversesEventId: text("reverses_event_id"),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reward_events_source_order_unique").on(table.sourceOrderId),
    uniqueIndex("reward_events_reverses_event_unique").on(table.reversesEventId),
    index("reward_events_customer_id_idx").on(table.customerId, table.createdAt),
  ]
);
