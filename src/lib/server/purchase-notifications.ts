import { eq, inArray } from "drizzle-orm";
import { users } from "@/db/schema/auth";
import { sendWhatsAppMessage } from "@/lib/chatxflow";
import type { Executor } from "./auth";
import { branchName } from "./task-notifications";
import { indentApprovalMessage } from "./whatsapp-triggers";

// PURCHASE-4: SUPER_ADMIN (Owner, always global) plus any active user scoped
// to this branch who actually holds the PURCHASE_INDENT grant — never a
// blanket "all managers" fan-out, matching the module-access convention
// (hasModule in permissions.ts) rather than inventing a role-based rule
// here. Deduped by phone, same as task-notifications.ts's escalation list.
export async function indentApprovalRecipients(executor: Executor, branchId: string): Promise<{ name: string; phone: string }[]> {
  const rows = await executor
    .select({ name: users.name, phoneE164: users.phoneE164, role: users.role, branchId: users.branchId, status: users.status, moduleAccess: users.moduleAccess })
    .from(users)
    .where(inArray(users.role, ["SUPER_ADMIN", "BRANCH_MANAGER", "CENTRAL_STORE_MGR", "ACCOUNTANT"]));
  const byPhone = new Map<string, { name: string; phone: string }>();
  for (const row of rows) {
    if (row.status !== "Active" || !row.phoneE164) continue;
    const eligible = row.role === "SUPER_ADMIN" || (row.branchId === branchId && row.moduleAccess.includes("PURCHASE_INDENT"));
    if (!eligible) continue;
    if (!byPhone.has(row.phoneE164)) byPhone.set(row.phoneE164, { name: row.name, phone: row.phoneE164 });
  }
  return [...byPhone.values()];
}

// Best-effort fan-out, never throws — a failed/unconfigured WhatsApp send
// must never block the indent submit response (same convention as every
// other trigger in this app). Caller fires this AFTER its own transaction
// has committed the PENDING_APPROVAL status, same ordering discipline as
// task-notifications.ts's reminder/escalation sends.
export async function sendIndentApprovalPing(
  executor: Executor,
  params: { indentId: string; branchId: string; spikePercent: string | null; hasData: boolean }
): Promise<number> {
  try {
    const recipients = await indentApprovalRecipients(executor, params.branchId);
    if (!recipients.length) return 0;
    const name = await branchName(executor, params.branchId);
    const message = indentApprovalMessage({ branchName: name, indentId: params.indentId, spikePercent: params.spikePercent, hasData: params.hasData });
    let sent = 0;
    for (const recipient of recipients) {
      const result = await sendWhatsAppMessage(recipient.phone, message, { relatedEntityType: "INDENT_APPROVAL", relatedEntityId: params.indentId });
      if (result.ok) sent++;
    }
    return sent;
  } catch {
    return 0; // best-effort only — never surfaces to the indent submit caller
  }
}
