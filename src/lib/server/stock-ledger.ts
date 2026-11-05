import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { stockMovements } from "../../db/schema/stock-ledger";
import type { Executor } from "./auth";
import { decimal, quantity } from "./production-quantity";

// GAP-004 — see src/db/schema/stock-ledger.ts for the full scope note. This
// module is the ONE posting seam for the four writers wired so far (GRN
// quality credit, deductStock's raw debit, deductStock's Semi-FG debit,
// produceSemiFg's Semi-FG credit). Callers must have already updated
// inventory_stock.qtyOnHand / semi_fg_stock.qtyOnHand in the SAME
// transaction before calling this — it does not touch those columns itself.

export type StockMovementType = "GRN_RECEIPT" | "PRODUCTION_CONSUME" | "PRODUCTION_OUTPUT" | "SEMI_FG_CONSUME" | "WASTAGE_WRITE_OFF" | "PHYSICAL_COUNT_ADJUST" | "ORDER_VOID_RESTOCK";

export type StockMovementInput = {
  branchId: string;
  qtyDelta: bigint; // signed millis (3-decimal fixed point, same unit as production-quantity.ts's quantity())
  movementType: StockMovementType;
  sourceType: string;
  // Multiple dispatches may belong to one order; retain its sourceId while
  // giving each dispatch its own deduplication identity.
  sourceEventId?: string;
  sourceId: string;
  actorId: string;
} & ({ rawMaterialId: string; menuItemId?: undefined } | { menuItemId: string; rawMaterialId?: undefined });

function signedDecimal(millis: bigint): string {
  const negative = millis < 0n;
  const abs = negative ? -millis : millis;
  return `${negative ? "-" : ""}${decimal(abs)}`;
}

// Idempotent insert: a retried request with the SAME (sourceType, sourceId,
// item id) is a safe no-op, never a duplicate posting — mirrors this
// project's existing audit_log/journal_entries idempotency convention.
export async function postStockMovement(tx: Executor, input: StockMovementInput): Promise<void> {
  if (input.qtyDelta === 0n) return; // nothing moved, nothing to record
  const itemId = input.rawMaterialId ?? input.menuItemId!;
  const idempotencyKey = `${input.sourceType}:${input.sourceEventId ?? input.sourceId}:${itemId}`;
  await tx
    .insert(stockMovements)
    .values({
      id: randomUUID(),
      branchId: input.branchId,
      itemType: input.rawMaterialId ? "RAW_MATERIAL" : "SEMI_FG",
      rawMaterialId: input.rawMaterialId ?? null,
      menuItemId: input.menuItemId ?? null,
      movementType: input.movementType,
      qtyDelta: signedDecimal(input.qtyDelta),
      idempotencyKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorId: input.actorId,
    })
    .onConflictDoNothing({ target: stockMovements.idempotencyKey });
}

// Reconciliation helper: the REAL sum of signed movements for one
// branch+raw-material. Used by tests/QA to prove the ledger agrees with the
// live inventory_stock.qtyOnHand projection — not a claim they share storage.
export async function ledgerBalance(tx: Executor, branchId: string, rawMaterialId: string): Promise<string> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${stockMovements.qtyDelta}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.branchId, branchId), eq(stockMovements.rawMaterialId, rawMaterialId)));
  return normalizeSum(row?.total);
}

// Same reconciliation helper for a Semi-FG item's semi_fg_stock projection.
export async function ledgerBalanceSemiFg(tx: Executor, branchId: string, menuItemId: string): Promise<string> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${stockMovements.qtyDelta}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.branchId, branchId), eq(stockMovements.menuItemId, menuItemId)));
  return normalizeSum(row?.total);
}

function normalizeSum(raw: string | undefined): string {
  // Postgres SUM(numeric) can return a bare "0" or a non-3dp string; normalize
  // through quantity()/decimal() so callers always get an exact 3dp string,
  // same convention as every other persisted quantity in this project.
  const normalized = /^-?\d+$/.test(raw ?? "0") ? `${raw ?? "0"}.000` : raw!;
  const negative = normalized.startsWith("-");
  const abs = negative ? normalized.slice(1) : normalized;
  const millis = quantity(abs, true);
  return negative ? `-${decimal(millis)}` : decimal(millis);
}
