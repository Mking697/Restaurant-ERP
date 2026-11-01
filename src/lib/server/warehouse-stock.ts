import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { warehouseStock } from "../../db/schema/warehouse-stock";
import { warehouses } from "../../db/schema/warehouses";
import type { Executor } from "./auth";
import { HttpError } from "./permissions";
import { decimal, MAX_QUANTITY, quantity } from "./production-quantity";

// GAP-004 follow-up slice: the real tracked balance for a CENTRAL warehouse.
// See src/db/schema/warehouse-stock.ts for the full scope note — this does
// NOT touch BRANCH warehouses or inventory_stock at all.

export async function assertCentralWarehouse(tx: Executor, warehouseId: string) {
  const [w] = await tx.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!w) throw new HttpError(404, "Warehouse not found");
  if (w.type !== "CENTRAL") throw new HttpError(400, "Only a CENTRAL warehouse has a tracked stock balance — BRANCH stock is inventory_stock, keyed by branchId");
  return w;
}

// Caller must already be inside the owning mutate() transaction. Creates the
// balance row on first credit. Used today only by the Owner/INVENTORY-gated
// stock-in endpoint — the one real "opening/receipt" writer for CENTRAL
// warehouse stock this slice adds.
export async function creditWarehouseStock(tx: Executor, warehouseId: string, rawMaterialId: string, qty: string) {
  const amount = quantity(qty, true);
  if (amount <= 0n) throw new HttpError(400, "Credit quantity must be greater than zero");
  const rows = await tx.select().from(warehouseStock).where(and(eq(warehouseStock.warehouseId, warehouseId), eq(warehouseStock.rawMaterialId, rawMaterialId))).limit(2).for("update");
  if (rows.length > 1) throw new HttpError(409, "Duplicate warehouse stock rows; reconcile first");
  const [existing] = rows;
  if (existing) {
    const newQty = quantity(existing.qtyOnHand, true) + amount;
    if (newQty > MAX_QUANTITY) throw new HttpError(409, "Warehouse stock capacity exceeded");
    await tx.update(warehouseStock).set({ qtyOnHand: decimal(newQty), updatedAt: new Date() }).where(eq(warehouseStock.id, existing.id));
  } else {
    await tx.insert(warehouseStock).values({ id: randomUUID(), warehouseId, rawMaterialId, qtyOnHand: qty });
  }
}

// Atomic, lock-then-check debit — this is what actually prevents overselling
// central stock (two concurrent dispatches against one balance: only one
// can succeed). Throws 409 (not silently clamping) when insufficient.
export async function debitWarehouseStock(tx: Executor, warehouseId: string, rawMaterialId: string, qty: string) {
  const amount = quantity(qty, true);
  if (amount <= 0n) throw new HttpError(400, "Debit quantity must be greater than zero");
  const rows = await tx.select().from(warehouseStock).where(and(eq(warehouseStock.warehouseId, warehouseId), eq(warehouseStock.rawMaterialId, rawMaterialId))).limit(2).for("update");
  if (rows.length > 1) throw new HttpError(409, "Duplicate warehouse stock rows; reconcile first");
  const [existing] = rows;
  const available = existing ? quantity(existing.qtyOnHand, true) : 0n;
  if (available < amount) throw new HttpError(409, `Insufficient central warehouse stock: available ${existing ? existing.qtyOnHand : "0.000"}, requested ${qty}`);
  await tx.update(warehouseStock).set({ qtyOnHand: decimal(available - amount), updatedAt: new Date() }).where(eq(warehouseStock.id, existing!.id));
}
