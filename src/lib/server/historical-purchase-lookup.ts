import { and, eq } from "drizzle-orm";
import { indents, indentLines } from "../../db/schema/purchase";
import { rawMaterials } from "../../db/schema/menu";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";

// IDs are opaque bounded text, not necessarily UUIDs. Never normalize a token.
export function historicalId(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 200 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) throw new HttpError(400, "Invalid document or branch ID");
  return value;
}
export function historicalQuery(request: Request, id: unknown) {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => key !== "branchId") || query.getAll("branchId").length !== 1) throw new HttpError(400, "Exactly one branchId is required");
  return { id: historicalId(id), branchId: historicalId(query.get("branchId")) };
}
export async function readApprovedIndent(tx: Executor, actor: Identity, id: string, branchId: string | null) {
  assertModule(actor, "PURCHASE_ORDER");
  historicalId(id);
  const scope = branchScope(actor, historicalId(branchId));
  const [row] = await tx.select({ id: indents.id, branchId: indents.branchId }).from(indents)
    .where(and(eq(indents.id, id), eq(indents.branchId, scope!), eq(indents.status, "APPROVED"))).limit(1);
  if (!row) throw new HttpError(404, "Approved indent not found");
  const lines = await tx.select({ rawMaterialId: indentLines.rawMaterialId, qty: indentLines.qty, name: rawMaterials.name, unit: rawMaterials.unit })
    .from(indentLines).innerJoin(rawMaterials, eq(rawMaterials.id, indentLines.rawMaterialId)).where(eq(indentLines.indentId, row.id));
  return { ...row, lines };
}
