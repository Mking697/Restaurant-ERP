import { db } from "@/db/client";
import { locked } from "@/lib/server/auth";
import { validCronSecret } from "@/lib/server/cron-auth";
import { json } from "@/lib/server/http";
import { claimDueTaskReminders, escalateOverdueInstances, generateRecurringOccurrences } from "@/lib/server/task-generation";
import { sendDueTaskReminders, sendTaskEscalationNotices } from "@/lib/server/task-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Machine-to-machine cron trigger ONLY — see src/lib/server/cron-auth.ts for
// the bearer-secret check shared with every other cron endpoint in this app.

export async function POST(request: Request) {
  if (!validCronSecret(request)) return json({ error: "Unauthorized" }, 401);
  try {
    const now = new Date();
    // Same existing pg_advisory_xact_lock-backed transaction every other
    // mutation in this app uses — serializes concurrent cron ticks (e.g. two
    // overlapping Vercel Cron invocations) at the database itself, on top of
    // the unique-constraint/WHERE-guarded idempotency inside each function.
    // AUTOMATION-1b: claimDueTaskReminders/escalateOverdueInstances only
    // CLAIM (one-shot, WHERE-guarded) inside this transaction — the actual
    // WhatsApp network sends happen AFTER it commits (see below), so a slow
    // or stuck outbound call can never hold the advisory lock.
    const { generated, escalatedRows, reminderRows } = await locked(async (tx) => {
      const generated = await generateRecurringOccurrences(tx, now);
      const escalatedRows = await escalateOverdueInstances(tx, now);
      const reminderRows = await claimDueTaskReminders(tx, now);
      return { generated, escalatedRows, reminderRows };
    });
    const remindersSent = await sendDueTaskReminders(db, reminderRows);
    const escalationNoticesSent = await sendTaskEscalationNotices(db, escalatedRows);
    return json({ generated, escalated: escalatedRows.length, remindersSent, escalationNoticesSent }, 200);
  } catch {
    // Never return database details, SQL, or secret material.
    return json({ error: "Database or server unavailable" }, 503);
  }
}

// Vercel Cron invokes GET; manual POST callers retain the identical auth,
// transaction and idempotency guarantees. Never expose an unauthenticated tick.
export const GET = POST;
