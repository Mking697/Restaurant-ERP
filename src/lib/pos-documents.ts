// Pure transport types: no persistence or server imports.
export const POS_DOCUMENT_DISCLAIMER = "INTERNAL SALES DOCUMENT — NOT A FISCAL RECEIPT";
export type Document = {
  id: string; branchId: string; kind: "PROFORMA" | "FINAL"; number: string; issuedAt: string;
  sourceType: "DRAFT" | "ORDER"; sourceId: string; sourceRevision: number;
  orderId: string | null; proformaId: string | null; receiptNumber: string | null;
  seller: { name: string; branchName: string; branchCode: string; address: string; tin: null; vrn: null };
  customer: { name: string; phone: string } | null; orderNumber: string | null; tableNo: string; channel: string;
  lines: { orderLineId?: string; menuItemId: string; name: string; productCode: string; qty: number; price: string; vatRatePercent: string; lineTotal: string }[];
  subtotal: string; taxAmount: string; totalAmount: string;
  vat: { rates: { ratePercent: string; taxableAmount: string; vatAmount: string }[]; grandTaxable: string; grandTotalTax: string; grandTotal: string };
  currency: { baseCode: "TZS"; tenderCurrencyCode: string; fxRateToInr: string; tenderCurrencyAmount: string };
  disclaimer: string;
};
export type DocumentSummary = Pick<Document, "id" | "branchId" | "kind" | "number" | "issuedAt" | "sourceType" | "sourceId" | "sourceRevision" | "orderId" | "proformaId" | "receiptNumber" | "totalAmount" | "currency">;
export type PosDocument = Document;
export type PosDocumentSummary = DocumentSummary;
