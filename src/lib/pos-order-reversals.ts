export type OrderReversalLine = { menuItemId: string; name: string; qty: number };
export type OrderReversal = {
  id: string;
  orderId: string;
  branchId: string;
  reason: string;
  actorId: string;
  actorName: string;
  priorStatus: "PAID" | "COMPLETED";
  paymentId: string | null;
  receiptId: string | null;
  finalDocumentId: string | null;
  cogsAmountAtVoid: string;
  refundLiabilityAmount: string | null;
  restockedLines: OrderReversalLine[];
  wastedLines: OrderReversalLine[];
  createdAt: string;
};
