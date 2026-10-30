import { db } from "@/db/client";
import { whatsAppMessageLog } from "@/db/schema/whatsapp";
import { getAllSettings, getSetting } from "@/lib/settings";

/**
 * WhatsApp send layer — ChatXFlow (chatxflow.online), same provider and same
 * hardened transport pattern as Pro ERP's `src/lib/chatxflow.ts`. Copied
 * deliberately close to that file (not reinvented) because its security
 * properties were already reviewed there: origin pinning, redirect block,
 * timeout budgets, batch worker pool. Differences from Pro ERP's version:
 *   - settings are GLOBAL here (single tenant), not per-org.
 *   - every send/receive is also written to whatsAppMessageLog for the
 *     restaurant ERP's own audit trail (Pro ERP doesn't need this; we do,
 *     per the brief's WhatsApp audit requirement).
 */

export const DEFAULT_CHATXFLOW_BASE_URL = "https://chatxflow.online";

/** Only the explicitly approved provider origin is supported. Tenant-controlled
 * DNS/config must never be able to pick this server's outbound destination —
 * reject custom hosts, subdomains, credentials, ports, paths, queries. Adding a
 * hostname regex later is NOT sufficient; a genuinely different provider needs
 * its own separately reviewed, connection-pinned transport, not a relaxed check
 * here. */
export function approvedChatXFlowBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim() || DEFAULT_CHATXFLOW_BASE_URL);
    if (
      url.origin !== DEFAULT_CHATXFLOW_BASE_URL ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

interface SendResult {
  ok: boolean;
  error?: string;
}

/** ChatXFlow expects a full number with country code (e.g. "255712345678").
 * Staff/vendor/customer phone numbers are stored as bare 9-digit Tanzanian
 * mobile numbers in most places in this schema (users.phoneE164 is the
 * exception — that one is already E.164). Anything that already looks like
 * it carries a country code is left untouched rather than guessed at. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `255${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `255${digits.slice(1)}`;
  return digits;
}

async function getConfig(): Promise<{ baseUrl: string; token: string } | null> {
  const [baseUrl, token] = await Promise.all([
    getSetting("CHATXFLOW_BASE_URL"),
    getSetting("CHATXFLOW_API_TOKEN"),
  ]);
  if (!token) return null;
  return { baseUrl: baseUrl || DEFAULT_CHATXFLOW_BASE_URL, token };
}

const CALL_BUDGET_MS = 20_000;
const BATCH_BUDGET_MS = 60_000;
const RECIPIENT_WORKERS = 4;
type SenderConfig = { baseUrl: string; token: string };
export interface WhatsAppRecipient {
  phone: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/** No retries: a lost acknowledgement or deadline may already have delivered. */
async function sendConfigured(
  config: SenderConfig | null,
  phone: string,
  message: string,
  parent?: AbortSignal
): Promise<SendResult> {
  if (!phone) return { ok: false, error: "Phone number missing." };
  if (!config) return { ok: false, error: "ChatXFlow abhi Settings me configure nahi hua hai." };
  const baseUrl = approvedChatXFlowBaseUrl(config.baseUrl);
  if (!baseUrl) return { ok: false, error: "Only https://chatxflow.online is an approved WhatsApp provider." };

  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, CALL_BUDGET_MS);
  let rejectDeadline: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = () =>
      reject(new Error("WhatsApp deadline exceeded; delivery outcome unknown. Do not retry automatically."));
    controller.signal.addEventListener("abort", rejectDeadline, { once: true });
  });

  try {
    if (parent?.aborted) abort();
    const operation = async () => {
      if (controller.signal.aborted) throw new Error("WhatsApp budget exhausted.");
      const res = await fetch(`${baseUrl}/api/v1/send`, {
        redirect: "error", // no redirect destination ever receives a replayed token/message
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ phone: normalizePhone(phone), message }),
      });
      const body = await res.json().catch((error: unknown) => {
        if (controller.signal.aborted) throw error;
        return {} as Record<string, unknown>;
      });
      return res.ok && body.success
        ? { ok: true }
        : { ok: false, error: (body.error as string) || `HTTP ${res.status}` };
    };
    return await Promise.race([operation(), deadline]);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
    if (rejectDeadline) controller.signal.removeEventListener("abort", rejectDeadline);
  }
}

async function logMessage(params: {
  direction: "OUTBOUND" | "INBOUND";
  phone: string;
  message: string;
  result?: SendResult;
  relatedEntityType?: string;
  relatedEntityId?: string;
}): Promise<void> {
  await db
    .insert(whatsAppMessageLog)
    .values({
      id: crypto.randomUUID(),
      direction: params.direction,
      fromPhone: params.direction === "OUTBOUND" ? "HQ" : params.phone,
      toPhone: params.direction === "OUTBOUND" ? params.phone : "HQ",
      messageType: "TEXT",
      payloadJson: { message: params.message, result: params.result ?? null },
      relatedEntityType: params.relatedEntityType ?? "",
      relatedEntityId: params.relatedEntityId ?? "",
    })
    .catch(() => undefined); // audit log failure must never block/undo the actual send
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  opts?: { relatedEntityType?: string; relatedEntityId?: string }
): Promise<SendResult> {
  const result = await sendConfigured(await getConfig(), phone, message);
  await logMessage({ direction: "OUTBOUND", phone, message, result, ...opts });
  return result;
}

/** One global settings snapshot, N workers, a shared end-to-end send budget.
 * Unstarted recipients count as failed; active timeouts are unknown delivery,
 * never retried. Used for things like the 8AM Owner Coffee Summary fan-out or
 * a vendor PO blast — anywhere this ERP needs to message many people at once. */
export async function sendWhatsAppBatch(
  recipients: WhatsAppRecipient[]
): Promise<{ sent: number; failed: number }> {
  if (!recipients.length) return { sent: 0, failed: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BATCH_BUDGET_MS);
  let next = 0;
  let sent = 0;
  let rejectBudget: (() => void) | undefined;
  const budget = new Promise<never>((_resolve, reject) => {
    rejectBudget = () => reject(new Error("WhatsApp batch budget exhausted"));
    controller.signal.addEventListener("abort", rejectBudget, { once: true });
  });
  try {
    const snapshot = await Promise.race([getAllSettings(), budget]);
    const config = snapshot.CHATXFLOW_API_TOKEN
      ? { baseUrl: snapshot.CHATXFLOW_BASE_URL || DEFAULT_CHATXFLOW_BASE_URL, token: snapshot.CHATXFLOW_API_TOKEN }
      : null;
    const worker = async () => {
      while (!controller.signal.aborted && next < recipients.length) {
        const recipient = recipients[next++];
        const result = await sendConfigured(config, recipient.phone, recipient.message, controller.signal);
        await logMessage({
          direction: "OUTBOUND",
          phone: recipient.phone,
          message: recipient.message,
          result,
          relatedEntityType: recipient.relatedEntityType,
          relatedEntityId: recipient.relatedEntityId,
        });
        if (result.ok) sent++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(RECIPIENT_WORKERS, recipients.length) }, worker));
  } catch {
    controller.abort();
  } finally {
    clearTimeout(timer);
    if (rejectBudget) controller.signal.removeEventListener("abort", rejectBudget);
  }
  return { sent, failed: recipients.length - sent };
}
