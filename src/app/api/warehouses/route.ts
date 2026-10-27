import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { warehouses } from "@/db/schema/warehouses";
import { branches } from "@/db/schema/platform";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json, string } from "@/lib/server/http";
import { assertModule, assertOwner, HttpError } from "@/lib/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WAREHOUSE_TYPES = ["CENTRAL", "BRANCH"] as const;

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireIdentity(request);
    assertModule(actor, "INVENTORY");
    const rows = await db.select().from(warehouses).orderBy(warehouses.type, warehouses.name);
    return json({ warehouses: rows });
  });
}

// Structural/HQ-level, same convention as creating a branch — Owner only.
export async function POST(request: Request) {
  return api(async () => {
    const warehouse = await mutate(request, async (tx, actor) => {
      assertOwner(actor);
      const input = await body(request);
      const name = string(input.name, "name");
      if (!(WAREHOUSE_TYPES as readonly unknown[]).includes(input.type)) throw new HttpError(400, "Invalid type");
      const type = input.type as (typeof WAREHOUSE_TYPES)[number];
      let branchId: string | null = null;
      if (type === "BRANCH") {
        branchId = string(input.branchId, "branchId");
        if (!(await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1)).length) throw new HttpError(400, "Branch not found");
      } else if (input.branchId !== undefined && input.branchId !== null) {
        throw new HttpError(400, "A CENTRAL warehouse cannot have a branchId");
      }
      const id = randomUUID();
      await tx.insert(warehouses).values({ id, type, branchId, name });
      const [row] = await tx.select().from(warehouses).where(eq(warehouses.id, id));
      return row;
    });
    return json({ warehouse }, 201);
  });
}
