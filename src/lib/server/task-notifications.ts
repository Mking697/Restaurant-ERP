import { eq, inArray } from "drizzle-orm";
import { branches } from "@/db/schema/platform";
import { users } from "@/db/schema/auth";
import { sendWhatsAppMessage } from "@/lib/chatxflow";
import type { Executor } from "./auth";
import type { DueReminderInstance, EscalatedInstance } from "./task-generation";
import { taskEscalationMessage, taskReminderMessage } from "./whatsapp-triggers";

// ---------------------------------------------------------------------------
// AUTOMATION-1b — WhatsApp send orchestration for staff/owner-facing task
// reminders + overdue escalation. Pure recipient-resolution helpers are
// exported separately from the DB-touching send loop so both halves are
// independently testable; DB is accessed only AFTER the cron route's own
// locked() transaction has already committed the one-shot claim (see
// src/lib/server/task-generation.ts claimDueTaskReminders/
// escalateOverdueInstances) — sending/looking-up-recipients never happens
// inside that advisory-lock transaction, so a slow/stuck WhatsApp call can
// never hold up the generation/escalation lock.
//
// CRITICAL invariant enforced throughout this file: only message a user who
// (a) has a non-empty phoneE164 on file and (b) status === "Active". A
// deactivated/removed user is never a valid recipient, full stop — see
// activeContact() below, the single choke point every send path goes
// through.
// ---------------------------------------------------------------------------

export interface Contact {
  name: string;
  phone: string;
}

export async function branchName(executor: Executor, branchId: string): Promise<string> {
  const [row] = await executor.select({ name: branches.name }).from(branches).where(eq(branches.id, branchId)).limit(1);
  return row?.name ?? "Branch";
}

export async function activeContact(executor: Executor, userId: string): Promise<Contact | null> {
  const [row] = await executor
    .select({ name: users.name, phoneE164: users.phoneE164, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || row.status !== "Active" || !row.phoneE164) return null;
  return { name: row.name, phone: row.phoneE164 };
}

// Every active BRANCH_MANAGER scoped to this exact branch, plus every active
// SUPER_ADMIN (Owner — always global, never branch-scoped) — deduped by
// phone so one person holding both doesn't get double-messaged. Shared
// manager/Owner phones receive the lower visibility, independent of row order.
export interface EscalationContact extends Contact {
  // Effective destination visibility, not an assertion about a unique user:
  // shared Owner/manager phones are deliberately downgraded.
  role: "BRANCH_MANAGER" | "SUPER_ADMIN";
}
export async function branchEscalationRecipients(executor: Executor, branchId: string): Promise<EscalationContact[]> {
  const rows = await executor
    .select({ name: users.name, phoneE164: users.phoneE164, role: users.role, branchId: users.branchId, status: users.status })
    .from(users)
    .where(inArray(users.role, ["BRANCH_MANAGER", "SUPER_ADMIN"]));
  // Even an out-of-branch manager sharing an Owner's phone must not receive
  // Owner-only sales through that shared destination. This never adds recipients.
  const managerPhones = new Set(rows.filter(row => row.status === "Active" && row.role === "BRANCH_MANAGER" && row.phoneE164).map(row => row.phoneE164));
  const byPhone = new Map<string, EscalationContact>();
  for (const row of rows) {
    if (row.status !== "Active" || !row.phoneE164) continue;
    if (row.role !== "BRANCH_MANAGER" && row.role !== "SUPER_ADMIN") continue;
    if (row.role === "BRANCH_MANAGER" && row.branchId !== branchId) continue;
    const existing = byPhone.get(row.phoneE164);
    if (!existing || row.role === "BRANCH_MANAGER") {
      byPhone.set(row.phoneE164, { name: row.name, phone: row.phoneE164, role: managerPhones.has(row.phoneE164) ? "BRANCH_MANAGER" : row.role });
    }
  }
  return [...byPhone.values()];
}

// One WhatsApp send per claimed occurrence, to its assigned doer only.
// Occurrences with no eligible (active + phoned) assignee are skipped —
// never fabricate/guess a recipient, and the claim itself (reminderSentAt)
// was already committed before this function runs, so a skip here is final
// for this occurrence, same documented best-effort convention as every
// other WhatsApp trigger in this app.
export async function sendDueTaskReminders(executor: Executor, candidates: DueReminderInstance[]): Promise<number> {
  let sent = 0;
  for (const row of candidates) {
    const contact = await activeContact(executor, row.assignedToId);
    if (!contact) continue;
    const name = await branchName(executor, row.branchId);
    const message = taskReminderMessage({ doerName: contact.name, title: row.title, branchName: name, dueAt: row.dueAt });
    const result = await sendWhatsAppMessage(contact.phone, message, {
      relatedEntityType: "TASK_REMINDER",
      relatedEntityId: row.id,
    });
    if (result.ok) sent++;
  }
  return sent;
}

// One WhatsApp send per (escalated occurrence x eligible branch manager/Owner
// recipient). A branch with no eligible recipient at all is skipped.
export async function sendTaskEscalationNotices(executor: Executor, candidates: EscalatedInstance[]): Promise<number> {
  let sent = 0;
  for (const row of candidates) {
    const recipients = await branchEscalationRecipients(executor, row.branchId);
    if (!recipients.length) continue;
    const doer = await activeContact(executor, row.assignedToId);
    const name = await branchName(executor, row.branchId);
    const message = taskEscalationMessage({
      title: row.title,
      doerName: doer?.name ?? "the assigned staff member",
      branchName: name,
      dueAt: row.dueAt,
    });
    for (const recipient of recipients) {
      const result = await sendWhatsAppMessage(recipient.phone, message, {
        relatedEntityType: "TASK_ESCALATION",
        relatedEntityId: row.id,
      });
      if (result.ok) sent++;
    }
  }
  return sent;
}
