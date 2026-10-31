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
  // Tanzanian mobile numbers: 9 digits starting 6 or 7, with or without a
  // leading 0 (local dialling convention), or the full 255 country code.
  if (digits.length === 9 && /^[67]/.test(digits)) return digits;
  if (digits.length === 10 && /^0[67]/.test(digits)) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("255") && /^255[67]/.test(digits)) return digits.slice(3);
  throw new HttpError(400, "Enter a valid Tanzanian mobile number");
}

export function thankYouMessage(params: { customerName: string; orderNumber: string; totalAmount: string; branchName: string }): string {
  const name = params.customerName.trim() || "Guest";
  return `Namaste ${name}! Aapka order #${params.orderNumber} confirm ho gaya hai — Total TSh ${params.totalAmount} (${params.branchName}). Dhanyawad, phir se aaiyega! 🙏`;
}

export function offerMessage(params: { offerText: string; validUntil: string; branchName: string }): string {
  const text = params.offerText.trim();
  return `${params.branchName}: ${text}${params.validUntil ? ` (Valid tak ${params.validUntil})` : ""}`;
}

// ---------------------------------------------------------------------------
// AUTOMATION-1b — STAFF/OWNER-FACING ONLY (task reminders, overdue
// escalation notices, the ~8AM daily operational summary). Explicitly NOT
// customer-facing — thankYouMessage/offerMessage above are untouched and
// remain the only customer-facing templates. Plain, clear English by
// default with an optional short Hinglish line, same mixed-bilingual
// convention as the two functions above (no t()/uiText() call here because
// those exist for CLIENT UI copy only — every WhatsApp body in this file,
// customer- or staff-facing, has always been a plain string builder).
// ---------------------------------------------------------------------------

function shortClock(date: Date): string {
  // Fixed +05:30 wall-clock label, matching src/lib/server/task-generation.ts's
  // own IST-anchored due-date arithmetic — this is the same business clock
  // the scheduler itself uses, not a claim about the branch's real timezone.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function taskReminderMessage(params: { doerName: string; title: string; branchName: string; dueAt: Date }): string {
  const name = params.doerName.trim() || "Team";
  return `Reminder: "${params.title}" at ${params.branchName} is due now (${shortClock(params.dueAt)}). Please complete it and mark it done. / ${name}, yeh kaam ab due ho gaya hai, kripya turant complete karein. 🙏`;
}

export function taskEscalationMessage(params: { title: string; doerName: string; branchName: string; dueAt: Date }): string {
  const doer = params.doerName.trim() || "the assigned staff member";
  return `OVERDUE: "${params.title}" at ${params.branchName}, assigned to ${doer}, is more than 30 minutes overdue (due ${shortClock(params.dueAt)}). Please follow up. / Yeh kaam samay se zyada late ho gaya hai, kripya abhi follow-up karein.`;
}

export function dailySummaryMessage(params: {
  branchName: string;
  completedSales: number | null;
  overdueTasks: number;
  pendingHandover: boolean;
}): string {
  const salesLine = params.completedSales === null ? "sales data not available" : `${params.completedSales} completed sale(s)`;
  const handoverLine = params.pendingHandover ? ", 1 shift handover pending acceptance" : "";
  return `Good morning! Daily summary for ${params.branchName}: ${salesLine} today so far, ${params.overdueTasks} overdue task(s)${handoverLine}. / Aaj ka branch summary; kripya review karein. 🙏`;
}

// ---------------------------------------------------------------------------
// PURCHASE-4 (AUTOMATION-1c, completing the previously-documented gap) — real
// WhatsApp owner/approver ping when an Indent is routed to PENDING_APPROVAL
// by the rolling-average spike check (src/lib/server/purchase.ts
// evaluateIndentSpike). Best-effort, same convention as every trigger above:
// a failed send never blocks the submit response.
// ---------------------------------------------------------------------------
export function indentApprovalMessage(params: { branchName: string; indentId: string; spikePercent: string | null; hasData: boolean }): string {
  const reason = !params.hasData
    ? "not enough purchase history yet to compare"
    : `${params.spikePercent}% over the rolling average`;
  return `Indent approval needed at ${params.branchName}: ${reason}. Open Purchase & GRN to approve/reject indent #${params.indentId.slice(0, 8)}. / Ek indent approval ke liye ruka hai, kripya review karein. 🙏`;
}
