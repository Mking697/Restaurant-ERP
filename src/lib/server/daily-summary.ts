import { randomUUID } from "node:crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { branches } from "@/db/schema/platform";
import { dailySummaryLog } from "@/db/schema/notifications";
import { inventoryStock } from "@/db/schema/inventory";
import { posOrders } from "@/db/schema/pos";
import { shiftHandovers } from "@/db/schema/shifts";
import { taskInstances } from "@/db/schema/tasks";
import { locked } from "./auth";
import { istDateOnly } from "./task-generation";
import { branchEscalationRecipients } from "./task-notifications";
import { dailySummaryMessage } from "./whatsapp-triggers";
import { sendWhatsAppMessage } from "@/lib/chatxflow";

// ---------------------------------------------------------------------------
// AUTOMATION-1b — daily ~8AM operational summary. Per-branch, sent to that
// branch's active Owner/Branch Admin recipients only (branchEscalationRecipients,
// the exact same recipient-resolution helper the overdue escalation path
// already uses). STAFF/OWNER-FACING ONLY, never a customer message.
//
// Idempotency: for each branch this claims a (branchId, IST calendar day) row
// in daily_summary_log BEFORE any WhatsApp send is attempted (unique index ->
// a retried/overlapping invocation hits 23505 and is skipped, exactly the
// same "claim first, best-effort send after" convention used by
// generateRecurringOccurrences / claimDueTaskReminders).
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDayBoundsUtc(now: Date): { startUtc: Date; endUtc: Date; dateStr: string } {
  const dateStr = istDateOnly(now);
  const [y, m, d] = dateStr.split("-").map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc, dateStr };
}

export interface DailySummaryResult {
  branches: number;
  claimed: number;
  alreadySent: number;
  notified: number;
}

export async function runDailySummary(now: Date = new Date()): Promise<DailySummaryResult> {
  const { startUtc, endUtc, dateStr } = istDayBoundsUtc(now);
  const allBranches = await db.select({ id: branches.id, name: branches.name }).from(branches);

  let claimed = 0;
  let alreadySent = 0;
  let notified = 0;

  for (const branch of allBranches) {
    // One-shot claim per (branch, day) — see module header.
    const ok = await locked(async (tx) => {
      try {
        await tx.insert(dailySummaryLog).values({ id: randomUUID(), branchId: branch.id, summaryDate: dateStr });
        return true;
      } catch (error) {
        const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
        if (code === "23505") return false; // already claimed/sent for this branch+day
        throw error;
      }
    });
    if (!ok) {
      alreadySent++;
      continue;
    }
    claimed++;

    const completedRows = await db
      .select({ id: posOrders.id, ownerOnly: posOrders.ownerOnly })
      .from(posOrders)
      .where(
        and(
          eq(posOrders.branchId, branch.id),
          eq(posOrders.status, "COMPLETED"),
          gte(posOrders.createdAt, startUtc),
          lt(posOrders.createdAt, endUtc)
        )
      );
    // Fail closed for anything not explicitly public; never mention hidden sales
    // or a hidden subtotal in the manager-facing message.
    const publicCompletedToday = completedRows.filter(row => row.ownerOnly === false).length;

    const overdueRows = await db
      .select({ id: taskInstances.id })
      .from(taskInstances)
      .where(and(eq(taskInstances.branchId, branch.id), eq(taskInstances.status, "OVERDUE")));

    const [pendingHandover] = await db
      .select({ id: shiftHandovers.id })
      .from(shiftHandovers)
      .where(and(eq(shiftHandovers.branchId, branch.id), eq(shiftHandovers.status, "PENDING")))
      .limit(1);

    // minStockLevel = 0 is "no alert configured yet" at this branch for that
    // material (see inventory.ts schema comment) — exclude it, never treat
    // an unconfigured par level as "always below minimum".
    const [lowStockRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryStock)
      .where(and(eq(inventoryStock.branchId, branch.id), sql`${inventoryStock.minStockLevel} > 0`, lt(inventoryStock.qtyOnHand, inventoryStock.minStockLevel)));
    const lowStockCount = Number(lowStockRow?.count ?? 0);

    const recipients = await branchEscalationRecipients(db, branch.id);
    if (!recipients.length) continue;

    for (const recipient of recipients) {
      const message = dailySummaryMessage({
        branchName: branch.name,
        completedSales: recipient.role === "SUPER_ADMIN" ? completedRows.length : publicCompletedToday,
        overdueTasks: overdueRows.length,
        pendingHandover: Boolean(pendingHandover),
        lowStockCount,
      });
      const result = await sendWhatsAppMessage(recipient.phone, message, {
        relatedEntityType: "DAILY_SUMMARY",
        relatedEntityId: `${branch.id}:${dateStr}`,
      });
      if (result.ok) notified++;
    }
  }

  return { branches: allBranches.length, claimed, alreadySent, notified };
}
