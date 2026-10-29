import { eq } from "drizzle-orm";
import { branches } from "@/db/schema/platform";
import { vendors } from "@/db/schema/vendors";
import { rawMaterials } from "@/db/schema/menu";
import { indents, purchaseOrders, grns } from "@/db/schema/purchase";
import type { Executor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/permissions";

export async function ensureBranch(tx: Executor, branchId: string) {
  if (!(await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1)).length) {
    throw new HttpError(400, "Branch not found");
  }
}
export async function ensureVendor(tx: Executor, vendorId: string) {
  if (!(await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId)).limit(1)).length) {
    throw new HttpError(400, "Vendor not found");
  }
}
export async function ensureRawMaterial(tx: Executor, rawMaterialId: string) {
  if (!(await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId)).limit(1)).length) {
    throw new HttpError(400, "Raw material not found");
  }
}
export async function loadIndent(tx: Executor, id: string) {
  const [row] = await tx.select().from(indents).where(eq(indents.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Indent not found");
  return row;
}
export async function loadPo(tx: Executor, id: string) {
  const [row] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Purchase order not found");
  return row;
}
export async function loadGrn(tx: Executor, id: string) {
  const [row] = await tx.select().from(grns).where(eq(grns.id, id)).limit(1);
  if (!row) throw new HttpError(404, "GRN not found");
  return row;
}
