import { eq, is, or, sql } from "drizzle-orm";
import { getTableConfig, PgTable, type AnyPgColumn } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { warehouses } from "@/db/schema/warehouses";
import type { Executor } from "./auth";
import { assertOwner, HttpError, type Identity } from "./permissions";

// Same generic schema-derived dependency discovery as branch-deletion.ts
// (discoverBranchDependencies), independently implemented here rather than
// shared, so an edit to one Owner-delete precheck can never silently change
// the other's tested behavior. Derives from FK targets, never a hand-
// maintained table list.
type Dependency = { group: string; table: PgTable; columns: AnyPgColumn[] };
export type WarehouseDeletionCheck = { warehouseId: string; canDelete: boolean; dependencies: { group: string; count: number }[] };

export function discoverWarehouseDependencies(values: readonly unknown[]): Dependency[] {
  const result: Dependency[] = [];
  for (const table of new Set(values)) {
    if (!is(table, PgTable)) continue;
    const config = getTableConfig(table);
    const columns: AnyPgColumn[] = [];
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      if (ref.foreignTable !== warehouses) continue;
      if (ref.columns.length !== 1 || ref.foreignColumns[0] !== warehouses.id) throw new Error("Unsupported warehouse foreign key");
      columns.push(ref.columns[0]);
    }
    if (columns.length) result.push({ group: config.name, table, columns: [...new Set(columns)] });
  }
  return result.sort((a, b) => a.group.localeCompare(b.group));
}
export const warehouseDependencies = discoverWarehouseDependencies(Object.values(schema));

export async function checkWarehouseDeletion(tx: Executor, actor: Identity, warehouseId: string): Promise<WarehouseDeletionCheck> {
  assertOwner(actor);
  const [warehouse] = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!warehouse) throw new HttpError(404, "Warehouse not found");
  if (!warehouseDependencies.length) throw new Error("Warehouse dependencies unavailable");
  const result = await tx.execute<{ group: string; count: string }>(sql.join(warehouseDependencies.map(({ group, table, columns }) =>
    sql`select ${group}::text as "group", count(*)::text as "count" from ${table} where ${or(...columns.map(column => eq(column, warehouseId)))}`
  ), sql` union all `));
  if (result.rows.length !== warehouseDependencies.length) throw new Error("Incomplete warehouse dependency check");
  const seen = new Set<string>();
  const dependencies = result.rows.map(row => {
    const count = Number(row.count);
    if (!warehouseDependencies.some(d => d.group === row.group) || seen.has(row.group) || !/^\d+$/.test(row.count) || !Number.isSafeInteger(count)) throw new Error("Invalid warehouse dependency count");
    seen.add(row.group);
    return { group: row.group, count };
  }).filter(row => row.count > 0).sort((a, b) => a.group.localeCompare(b.group));
  return { warehouseId, canDelete: dependencies.length === 0, dependencies };
}
