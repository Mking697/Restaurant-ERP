import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema/settings";
import { publicBranding } from "@/lib/branding";
import type { Executor } from "./auth";
export const BRANDING_KEYS = ["RESTAURANT_NAME", "RESTAURANT_LOGO"];
export async function readBrandingValues(executor: Executor = db) {
  const rows = await executor.select({ key: settings.key, value: settings.value }).from(settings).where(inArray(settings.key, BRANDING_KEYS));
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}
export async function readBranding(executor: Executor = db) { return publicBranding(await readBrandingValues(executor)); }
export async function saveBranding(executor: Executor, value: { name: string; logo?: string }) {
  const rows = [{ key: "RESTAURANT_NAME", value: value.name }, ...(value.logo === undefined ? [] : [{ key: "RESTAURANT_LOGO", value: value.logo }])];
  for (const row of rows) await executor.insert(settings).values({ ...row, updatedAt: new Date() }).onConflictDoUpdate({ target: settings.key, set: { value: row.value, updatedAt: new Date() } });
}
