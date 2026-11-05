import { and, eq } from "drizzle-orm";
import { posOrders } from "../../db/schema/pos";
import type { Executor } from "./auth";
import { HttpError } from "./permissions";
import { readPosPaymentEvidence, verifiedPosPayment } from "./pos-payments";

/**
 * Shift-close tender seam (GAP-026): one shared read so a collected amount is
 * counted exactly once. Rows with paymentCaptured=true (the new ledger path)
 * must have verified payment evidence — any missing/inconsistent marked
 * evidence fails the whole close closed rather than silently re-using the
 * order's own tender projection (that would let a corrupted ledger double as
 * a legacy fallback). Legacy COMPLETED/PAID rows with paymentCaptured=false
 * keep using their own order projection — exactly the pre-GAP-026 behavior.
 */
export async function readPosCollectionTenders(tx: Executor, branchId: string, shiftRunId: string): Promise<{ tenderType: string; totalAmount: string }[]> {
  const rows = await tx.select().from(posOrders).where(and(eq(posOrders.shiftRunId, shiftRunId), eq(posOrders.branchId, branchId)));
  const eligible = rows.filter(row => row.status === "COMPLETED" || row.status === "PAID");
  const captured = eligible.filter(row => row.paymentCaptured);
  const evidence = await readPosPaymentEvidence(tx, captured.map(row => row.id));
  return eligible.map(row => {
    if (!row.paymentCaptured) return { tenderType: row.tenderType, totalAmount: row.totalAmount };
    try {
      const payment = verifiedPosPayment(row, evidence);
      return { tenderType: payment.tenderType, totalAmount: payment.amount };
    } catch {
      throw new HttpError(409, `Collection evidence missing or inconsistent for order ${row.orderNumber}; shift close blocked`);
    }
  });
}
