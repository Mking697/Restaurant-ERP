import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema/settings";

/** Single DB round-trip per read/write — no in-memory cache layer yet (add one
 * if this becomes a hot path; Pro ERP's getAllSettings() batches reads for its
 * WhatsApp-batch-send worker pool, mirror that if we build the same feature). */
export async function getSetting(key: string): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? "";
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
