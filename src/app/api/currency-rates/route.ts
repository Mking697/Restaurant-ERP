import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { currencyRates } from "@/db/schema/currency";
import { requireIdentity } from "@/lib/server/auth";
import { api, assertSameOrigin, body, json } from "@/lib/server/http";
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
// config, not a per-order action).
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const actor = await requireIdentity(request);
    assertOwner(actor);
    const input = await body(request);
    const currencyCode = typeof input.currencyCode === "string" ? input.currencyCode.toUpperCase().trim() : "";
    if (!CODE_RE.test(currencyCode)) throw new HttpError(400, "currencyCode must be a 3-letter ISO 4217 code (e.g. USD)");
    if (currencyCode === "INR") throw new HttpError(400, "INR is the base currency, it doesn't need a rate row");
    const rate = Number(input.rateToInr);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) throw new HttpError(400, "rateToInr must be a positive number");

    const [existing] = await db.select({ id: currencyRates.id }).from(currencyRates).where(eq(currencyRates.currencyCode, currencyCode)).limit(1);
    if (existing) {
      await db.update(currencyRates).set({ rateToInr: rate.toFixed(6), updatedByUserId: actor.id, updatedAt: new Date() }).where(eq(currencyRates.id, existing.id));
    } else {
      await db.insert(currencyRates).values({ id: randomUUID(), currencyCode, rateToInr: rate.toFixed(6), updatedByUserId: actor.id });
    }
    const [row] = await db.select().from(currencyRates).where(eq(currencyRates.currencyCode, currencyCode)).limit(1);
    return json({ currencyRate: row }, 201);
  });
}
