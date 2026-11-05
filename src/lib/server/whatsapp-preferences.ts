import { eq, inArray } from "drizzle-orm";
import { whatsAppOptOuts } from "../../db/schema/whatsapp";
import type { Executor } from "./auth";

// GAP-037: a phone opts out exactly once — a second attempt is a harmless
// no-op (onConflictDoNothing), never an error, never a duplicate row (the
// customer re-clicking the same link twice must never fail).
export async function optOutPhone(tx: Executor, phone: string): Promise<void> {
  await tx.insert(whatsAppOptOuts).values({ phone }).onConflictDoNothing();
}

export async function isOptedOut(tx: Executor, phone: string): Promise<boolean> {
  if (!phone) return false;
  const [row] = await tx.select().from(whatsAppOptOuts).where(eq(whatsAppOptOuts.phone, phone)).limit(1);
  return !!row;
}

// Bulk check for a broadcast (offer-alert) — one query instead of N.
export async function optedOutSet(tx: Executor, phones: string[]): Promise<Set<string>> {
  if (!phones.length) return new Set();
  const rows = await tx.select({ phone: whatsAppOptOuts.phone }).from(whatsAppOptOuts).where(inArray(whatsAppOptOuts.phone, phones));
  return new Set(rows.map((r) => r.phone));
}

// Phone must already be validated (validOptionalPhone-shaped bare 9-digit
// Tanzanian mobile) before this is called — this module only persists.
export function buildOptOutUrl(appPublicUrl: string, phone: string): string {
  const base = appPublicUrl.trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/whatsapp-optout?phone=${encodeURIComponent(phone)}`;
}
