import { eq, is, or, sql } from "drizzle-orm";
import { getTableConfig, PgTable, type AnyPgColumn } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { branches } from "@/db/schema/platform";
import type { Executor } from "./auth";
import { assertOwner, HttpError, type Identity } from "./permissions";

type Dependency = { group: string; table: PgTable; columns: AnyPgColumn[] };
export type BranchDeletionCheck = { branchId: string; canDelete: boolean; dependencies: { group: string; count: number }[] };

// Installed Drizzle getTableConfig includes inline AND extra-config FKs. Derive
// from FK targets, never branchId spelling/nullability or a hand-maintained list.
export function discoverBranchDependencies(values: readonly unknown[]): Dependency[] {
  const result: Dependency[] = [];
  for (const table of new Set(values)) {
    if (!is(table, PgTable)) continue;
    const config = getTableConfig(table);
    const columns: AnyPgColumn[] = [];
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      if (ref.foreignTable !== branches) continue;
      // Refuse unsupported future key shapes rather than publishing false readiness.
      if (ref.columns.length !== 1 || ref.foreignColumns[0] !== branches.id) throw new Error("Unsupported branch foreign key");
      columns.push(ref.columns[0]);
    }
    if (columns.length) result.push({ group: config.name, table, columns: [...new Set(columns)] });
  }
  return result.sort((a, b) => a.group.localeCompare(b.group));
}
export const branchDependencies = discoverBranchDependencies(Object.values(schema));

export async function checkBranchDeletion(tx: Executor, actor: Identity, branchId: string): Promise<BranchDeletionCheck> {
  assertOwner(actor);
  const [branch] = await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1);
  if (!branch) throw new HttpError(404, "Branch not found");
  if (!branchDependencies.length) throw new Error("Branch dependencies unavailable");
  // One statement/snapshot for all counts. OR counts a row only once when a
  // table has multiple references to this branch; no record fields are selected.
  const result = await tx.execute<{ group: string; count: string }>(sql.join(branchDependencies.map(({ group, table, columns }) =>
    sql`select ${group}::text as "group", count(*)::text as "count" from ${table} where ${or(...columns.map(column => eq(column, branchId)))}`
  ), sql` union all `));
  if (result.rows.length !== branchDependencies.length) throw new Error("Incomplete branch dependency check");
  const seen = new Set<string>();
  const dependencies = result.rows.map(row => {
    const count = Number(row.count);
    if (!branchDependencies.some(d => d.group === row.group) || seen.has(row.group) || !/^\d+$/.test(row.count) || !Number.isSafeInteger(count)) throw new Error("Invalid branch dependency count");
    seen.add(row.group);
    return { group: row.group, count };
  }).filter(row => row.count > 0).sort((a, b) => a.group.localeCompare(b.group));
  return { branchId, canDelete: dependencies.length === 0, dependencies };
}
