export type Payment = {
  id: string; branchId: string; orderId: string; receiptId: string; receiptNumber: string;
  amount: string; tenderType: string; tenderCurrencyCode: string; tenderCurrencyAmount: string; fxRateToInr: string;
  collectorId: string; collectorName: string; shiftRunId: string; collectedAt: string; sourceAction: 'CREATE' | 'SETTLE';
  finalDocumentId: string | null; finalDocumentNumber: string | null;
  allocation: { id: string; orderId: string; receiptId: string; finalDocumentId: string | null; amount: string };
};
export type PaymentOrderSummary = {
  id: string; branchId: string; orderNumber: string; status: 'OPEN' | 'PAID' | 'COMPLETED'; totalAmount: string;
  coverage: 'OPEN' | 'CAPTURED' | 'LEGACY' | 'UNAVAILABLE'; collectedAmount: string | null; outstandingAmount: string | null;
  legacyRecordedAmount: string | null; unavailableReason: string | null; payment: Payment | null;
};
export type PaymentList = { orders: PaymentOrderSummary[]; visibilityScope: 'actual' | 'access-filtered'; limit: 200; truncated: boolean; legacyNotice: string };
