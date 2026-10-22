import { eq } from "drizzle-orm";
import { users, roleEnum } from "@/db/schema/auth";
import { branches } from "@/db/schema/platform";
import type { Executor } from "./auth";
import { phone, string } from "./http";
import { assertDelegation, HttpError, validateGrants, type Identity, type Role } from "./permissions";
import { hashPassword, validPassword } from "./password";
export async function userInput(tx: Executor, actor: Identity, input: Record<string, unknown>, existing?: typeof users.$inferSelect) {
  const merged = { ...existing, ...input };
  const name = string(merged.name, "name"); const phoneE164 = phone(merged.phoneE164);
  if (!roleEnum.enumValues.includes(merged.role as Role)) throw new HttpError(400, "Invalid role");
  const role = merged.role as Role;
  const status = merged.status ?? "Active"; if (status !== "Active" && status !== "Inactive") throw new HttpError(400, "Invalid status");
  const moduleAccess = validateGrants(merged.moduleAccess ?? []);
  const hq = role === "SUPER_ADMIN" || role === "CENTRAL_STORE_MGR";
  const branchId = hq ? null : string(merged.branchId ?? (actor.role === "BRANCH_MANAGER" ? actor.branchId : undefined), "branchId");
  if (hq && merged.branchId != null && merged.branchId !== "") throw new HttpError(400, "HQ users must not have a branch");
  if (existing) assertDelegation(actor, existing);
  assertDelegation(actor, { id: existing?.id ?? "", role, branchId, moduleAccess });
  if (branchId && !(await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1)).length) throw new HttpError(400, "Branch not found");
  const reportingManagerId = merged.reportingManagerId === undefined ? "" : merged.reportingManagerId === "" ? "" : string(merged.reportingManagerId, "reportingManagerId");
  if (reportingManagerId) {
    const [manager] = await tx.select().from(users).where(eq(users.id, reportingManagerId)).limit(1);
    if (!manager || manager.status !== "Active" || (manager.branchId !== branchId && manager.role !== "SUPER_ADMIN")) throw new HttpError(400, "Invalid reporting manager");
  }
  let passwordHash = existing?.passwordHash;
  if (!existing || input.password !== undefined) {
    if (!validPassword(input.password)) throw new HttpError(400, "Password must have at least 12 characters and at most 256 UTF-8 bytes");
    passwordHash = await hashPassword(input.password);
  }
  // Never let the final active owner disappear; mutation lock serializes this check.
  if (existing?.role === "SUPER_ADMIN" && existing.status === "Active" && (role !== "SUPER_ADMIN" || status !== "Active")) {
    const owners = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.role, "SUPER_ADMIN"));
    if (!owners.some(user => user.id !== existing.id && user.status === "Active")) throw new HttpError(409, "Cannot remove the last active owner");
  }
  return { name, phoneE164, role, status, branchId, moduleAccess, reportingManagerId, passwordHash, deactivatedAt: status === "Inactive" ? existing?.deactivatedAt ?? new Date() : null };
}
