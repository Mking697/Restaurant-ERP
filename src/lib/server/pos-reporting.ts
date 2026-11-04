import { sql } from "drizzle-orm";
import { posOrders } from "@/db/schema/pos";

// Settlement is the sale event for PAID orders. Existing PAID rows without a
// timestamp and legacy COMPLETED rows retain their recorded creation date;
// this is a read-time compatibility rule, never a fabricated historical backfill.
// Decode projected SQL timestamps just like the timestamp column so downstream
// day buckets/comparisons receive Dates rather than driver timestamp strings.
export const posSaleTime = sql<Date>`case when ${posOrders.status} = 'PAID' then coalesce(${posOrders.settledAt}, ${posOrders.createdAt}) else ${posOrders.createdAt} end`.mapWith(posOrders.createdAt);
