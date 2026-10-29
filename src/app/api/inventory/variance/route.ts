import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { nightVarianceEntries, wastageLogs } from "@/db/schema/inventory";
import { branches } from "@/db/schema/platform";
import { rawMaterials } from "@/db/schema/menu";
import { users } from "@/db/schema/auth";
import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { assertModule, branchScope, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = {
  id: nightVarianceEntries.id,
  branchId: nightVarianceEntries.branchId,
  branchName: branches.name,
  rawMaterialId: nightVarianceEntries.rawMaterialId,
  rawMaterialName: rawMaterials.name,
  unit: rawMaterials.unit,
  shiftDate: nightVarianceEntries.shiftDate,
  theoreticalQty: nightVarianceEntries.theoreticalQty,
  physicalQty: nightVarianceEntries.physicalQty,
  varianceQty: nightVarianceEntries.varianceQty,
  varianceValueInr: nightVarianceEntries.varianceValueInr,
  chefOnDutyId: nightVarianceEntries.chefOnDutyId,
  chefOnDutyName: users.name,
  flaggedPilferage: nightVarianceEntries.flaggedPilferage,
  createdAt: nightVarianceEntries.createdAt,
};

function dateOnly(value: string | null, field: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `Invalid ${field}`);
  const dt = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0,10) !== value) throw new HttpError(400, `Invalid ${field}`);
  return value;
}

// GET /api/inventory/variance?branchId=&from=&to= — real night_variance_
// entries rows (raw-material + chef names joined), plus a real summary
// (totalVarianceValueInr / pilferageFlagCount) derived from those exact
// rows, never a separately-fabricated figure. Also backs the Reports
// "inventory-variance" slug.
export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "INVENTORY");
    const query = new URL(request.url).searchParams;
    const scope = branchScope(actor, query.get("branchId"));
    const from = dateOnly(query.get("from"), "from");
    const to = dateOnly(query.get("to"), "to");
    if (from && to && from > to) throw new HttpError(400, "from must not be after to");

    const entries = await db.select(columns).from(nightVarianceEntries)
      .innerJoin(rawMaterials, eq(rawMaterials.id, nightVarianceEntries.rawMaterialId))
      .innerJoin(users, eq(users.id, nightVarianceEntries.chefOnDutyId))
      .innerJoin(branches, eq(branches.id, nightVarianceEntries.branchId))
      .where(and(
        scope ? eq(nightVarianceEntries.branchId, scope) : undefined,
        from ? gte(nightVarianceEntries.shiftDate, from) : undefined,
        to ? lte(nightVarianceEntries.shiftDate, to) : undefined,
      ))
      .orderBy(desc(nightVarianceEntries.shiftDate));

    const wastage = await db.select({ id: wastageLogs.id, branchId: wastageLogs.branchId, branchName: branches.name, rawMaterialId: wastageLogs.rawMaterialId, rawMaterialName: rawMaterials.name, unit: rawMaterials.unit, qty: wastageLogs.qty, reason: wastageLogs.reason, photoUrl: wastageLogs.photoUrl, loggedById: wastageLogs.loggedById, loggedByName: users.name, loggedAt: wastageLogs.loggedAt })
      .from(wastageLogs).innerJoin(rawMaterials, eq(rawMaterials.id, wastageLogs.rawMaterialId)).innerJoin(users, eq(users.id, wastageLogs.loggedById)).innerJoin(branches, eq(branches.id, wastageLogs.branchId))
      .where(and(scope ? eq(wastageLogs.branchId, scope) : undefined, from ? gte(wastageLogs.loggedAt, new Date(`${from}T00:00:00+05:30`)) : undefined, to ? lt(wastageLogs.loggedAt, new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000)) : undefined)).orderBy(desc(wastageLogs.loggedAt));
    // Sum fixed-point stored money rather than binary floating-point INR.
    const cents = entries.reduce((sum, row) => sum + BigInt(row.varianceValueInr.replace(".", "")), 0n);
    const absolute = cents < 0n ? -cents : cents;
    const totalVarianceValueInr = `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2,"0")}`;
    const pilferageFlagCount = entries.filter((row) => row.flaggedPilferage).length;
    return json({ entries, wastage, summary: { totalVarianceValueInr, pilferageFlagCount, count: entries.length, wastageCount: wastage.length, totalWastageValueInr: null, wastageValueReason: "Wastage logs do not store historical valuation; quantities are reported in each material's own unit, not priced with an invented rate." } });
  });
}
