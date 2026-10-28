import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { currencyRates } from "@/db/schema/currency";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { assertOwner, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z]{3}$/;

export async function GET(request: Request) {
  return api(async () => {
    await requireIdentity(request); // any logged-in user can read rates (POS needs it)
    const rows = await db.select().from(currencyRates).orderBy(currencyRates.currencyCode);
    return json({ currencyRates: rows });
  });
}

// Owner-only — same convention as warehouses POST (structural/finance
// config, not a per-order action). Routed through the shared mutate() xact
// lock (security audit M2) so a concurrent upsert cannot race the
// select-then-insert/update against the same currency code.
export async function POST(request: Request) {
  return api(() => mutate(request, async (tx, actor) => {
    assertOwner(actor);
    const input = await body(request);
    const currencyCode = typeof input.currencyCode === "string" ? input.currencyCode.toUpperCase().trim() : "";
    if (!CODE_RE.test(currencyCode)) throw new HttpError(400, "currencyCode must be a 3-letter ISO 4217 code (e.g. USD)");
    if (currencyCode === "INR") throw new HttpError(400, "INR is the base currency, it doesn't need a rate row");
    const rate = Number(input.rateToInr);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) throw new HttpError(400, "rateToInr must be a positive number");

    const [existing] = await tx.select({ id: currencyRates.id }).from(currencyRates).where(eq(currencyRates.currencyCode, currencyCode)).limit(1);
    if (existing) {
      await tx.update(currencyRates).set({ rateToInr: rate.toFixed(6), updatedByUserId: actor.id, updatedAt: new Date() }).where(eq(currencyRates.id, existing.id));
    } else {
      await tx.insert(currencyRates).values({ id: randomUUID(), currencyCode, rateToInr: rate.toFixed(6), updatedByUserId: actor.id });
    }
    const [row] = await tx.select().from(currencyRates).where(eq(currencyRates.currencyCode, currencyCode)).limit(1);
    return json({ currencyRate: row }, 201);
  }));
}
