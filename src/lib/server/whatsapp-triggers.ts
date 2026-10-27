import { HttpError } from "./permissions";

// ---------------------------------------------------------------------------
// WhatsApp trigger copy — pure string builders, kept separate from the
// network layer (src/lib/chatxflow.ts) so message wording is unit-testable
// without a real ChatXFlow token. Both triggers are best-effort: a failed
// send never blocks the order or the campaign record — see call sites.
// ---------------------------------------------------------------------------

export function validOptionalPhone(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new HttpError(400, "Invalid phone");
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) return digits;
  throw new HttpError(400, "Enter a valid 10-digit mobile number");
}

export function thankYouMessage(params: { customerName: string; orderNumber: string; totalAmount: string; branchName: string }): string {
  const name = params.customerName.trim() || "Guest";
  return `Namaste ${name}! Aapka order #${params.orderNumber} confirm ho gaya hai — Total ₹${params.totalAmount} (${params.branchName}). Dhanyawad, phir se aaiyega! 🙏`;
}

export function offerMessage(params: { offerText: string; validUntil: string; branchName: string }): string {
  const text = params.offerText.trim();
  return `${params.branchName}: ${text}${params.validUntil ? ` (Valid tak ${params.validUntil})` : ""}`;
}
