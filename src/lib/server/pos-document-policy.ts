import type { Document } from "../pos-documents";
import { businessDateParts } from "./business-calendar";

export function documentNumber(kind: Document["kind"], branchCode: string, issuedAt: Date, sequence: string): string {
  if (!/^[1-9]\d*$/.test(sequence)) throw new Error("Invalid permanent document sequence");
  const safe = branchCode.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "BRANCH";
  const { y: year } = businessDateParts(issuedAt);
  return `${kind === "PROFORMA" ? "PF" : "INV"}-${safe}-${year}-${sequence.padStart(8, "0")}`;
}

// Identity/order-line IDs are not comparable across a saved draft and dispatch.
export function sameDocumentEvidence(a: Document, b: Pick<Document, "lines" | "subtotal" | "taxAmount" | "totalAmount">): boolean {
  const evidence = (d: typeof b) => JSON.stringify({ lines: d.lines.map(({ menuItemId, name, productCode, qty, price, vatRatePercent, lineTotal }) => ({ menuItemId, name, productCode, qty, price, vatRatePercent, lineTotal })).sort((x,y) => JSON.stringify(x).localeCompare(JSON.stringify(y))), subtotal: d.subtotal, taxAmount: d.taxAmount, totalAmount: d.totalAmount });
  return evidence(a) === evidence(b);
}
