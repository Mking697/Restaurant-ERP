import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Executor } from "./auth";
import { businessDateString } from "./business-calendar";
import type { OrderChannel } from "./pos-order-policy";

// ---------------------------------------------------------------------------
// GAP-029: an atomic, branch/business-day/channel-scoped customer-facing
// pickup token — distinct from the internal order id and from any
// statutory invoice number (pos_documents.number is a separate, legally
// approved identity; this token is never reused as one).
//
// Scoped to TAKEAWAY only in this pass (the gap's explicit title); a dine-in
// table order never gets a pickup token. GAP-030 may layer a platform-
// specific display token for SWIGGY/ZOMATO on top of this same allocator.
//
// Atomic under concurrency: the single INSERT ... ON CONFLICT DO UPDATE
// below serializes on the row lock Postgres takes for the conflicting
// unique (branch, business day, channel) key — two concurrent takeaway
// orders in the same branch on the same Tanzania business day can never
// receive the same number. The counter only ever increases: a cancelled or
// voided order's token is never freed or reassigned to a later order
// (deliberate gap, not a bug), and rollover is implicit — a new Tanzania
// business day is a new scope row starting back at 1. Two branches never
// collide because branchId is part of the scope key.
// ---------------------------------------------------------------------------
const PICKUP_TOKEN_CHANNELS: readonly OrderChannel[] = ["TAKEAWAY"];

export async function allocatePickupToken(tx: Executor, branchId: string, channel: OrderChannel, now: Date): Promise<string> {
  if (!PICKUP_TOKEN_CHANNELS.includes(channel)) return "";
  const businessDate = businessDateString(now);
  const result = await tx.execute<{ last_value: number }>(sql`
    insert into pos_token_sequences (id, branch_id, business_date, channel, last_value)
    values (${randomUUID()}, ${branchId}, ${businessDate}, ${channel}, 1)
    on conflict (branch_id, business_date, channel)
    do update set last_value = pos_token_sequences.last_value + 1
    returning last_value
  `);
  const lastValue = Number(result.rows[0]?.last_value);
  if (!Number.isInteger(lastValue) || lastValue < 1) throw new Error("Pickup token allocation failed");
  return `T-${lastValue}`;
}
