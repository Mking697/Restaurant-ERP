import { MODULE_KEYS, type ModuleKey } from "../moduleAccess";
export type Role = "SUPER_ADMIN" | "CENTRAL_STORE_MGR" | "BRANCH_MANAGER" | "CASHIER" | "KITCHEN_STAFF" | "ACCOUNTANT";
export interface Identity { id: string; name: string; email: string; phoneE164: string; role: Role; branchId: string | null; moduleAccess: string[]; status: "Active" | "Inactive"; }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function assertOwner(user: Identity) { if (user.role !== "SUPER_ADMIN") throw new HttpError(403, "Owner access required"); }
// Nov 2026: Central Purchase (the shared HQ/cross-branch warehouse's own
// purchase-request -> PO -> GRN -> quality -> invoice -> payment pipeline,
// src/lib/server/central-purchase.ts) was previously reachable by ANY user
// holding the generic PURCHASE_ORDER module — including a Branch Manager
// granted that module purely for their own branch's ordinary purchasing.
// CENTRAL_STORE_MGR is a real, dedicated role (branchId null, same as
// SUPER_ADMIN) that exists specifically for this cross-branch/HQ purchasing
// — restrict every central-purchase route to Owner or that role.
export function assertCentralStoreAccess(user: Identity) { if (user.role !== "SUPER_ADMIN" && user.role !== "CENTRAL_STORE_MGR") throw new HttpError(403, "Central warehouse purchasing requires Owner or Central Store Manager access"); }
export function hasModule(user: Identity, key: ModuleKey) { return user.role === "SUPER_ADMIN" || user.moduleAccess.includes(key); }
export function assertModule(user: Identity, key: ModuleKey) { if (!hasModule(user, key)) throw new HttpError(403, "Module access required"); }
export function assertAnyModule(user: Identity, keys: ModuleKey[]) { if (!keys.some(key => hasModule(user, key))) throw new HttpError(403, "Module access required"); }
export function assertUserAdmin(user: Identity) {
  if (user.role !== "SUPER_ADMIN" && user.role !== "BRANCH_MANAGER") throw new HttpError(403, "User administration required");
}
export function branchScope(user: Identity, requested?: string | null): string | null {
  if (user.role === "SUPER_ADMIN") return requested || null;
  if (!user.branchId) throw new HttpError(403, "Branch membership required");
  if (requested && requested !== user.branchId) throw new HttpError(403, "Branch access denied");
  return user.branchId;
}
export function assertHoReviewAccess(user: Pick<Identity, "role" | "branchId" | "moduleAccess">) {
  if (user.role === "SUPER_ADMIN") return;
  if (user.role !== "CENTRAL_STORE_MGR" || user.branchId) throw new HttpError(403, "HQ stock review role required");
  if (!user.moduleAccess.includes("HO_STOCK_REVIEW")) throw new HttpError(403, "HO stock review access required");
}
export function hoReviewScope(user: Pick<Identity, "role" | "branchId" | "moduleAccess">, requested: string): string {
  assertHoReviewAccess(user);
  if (!requested) throw new HttpError(400, "Select a branch");
  return requested;
}
export function validateGrants(value: unknown): ModuleKey[] {
  if (!Array.isArray(value) || value.some(k => typeof k !== "string" || !(MODULE_KEYS as readonly string[]).includes(k))) throw new HttpError(400, "Invalid moduleAccess");
  return [...new Set(value)] as ModuleKey[];
}
export function assertDelegation(actor: Identity, target: Pick<Identity, "id" | "role" | "branchId" | "moduleAccess">) {
  assertUserAdmin(actor);
  if (actor.role === "SUPER_ADMIN") return;
  if (target.id === actor.id) throw new HttpError(403, "Branch admins cannot edit themselves");
  branchScope(actor, target.branchId);
  if (!target.branchId || !["BRANCH_MANAGER", "CASHIER", "KITCHEN_STAFF", "ACCOUNTANT"].includes(target.role)) throw new HttpError(403, "Cannot manage HQ roles");
  if (target.moduleAccess.some(key => !actor.moduleAccess.includes(key))) throw new HttpError(403, "Cannot delegate unheld grants");
}
export function safeUser(user: Omit<Identity, "email" | "phoneE164"> & { email?: string | null; phoneE164?: string | null; createdAt?: Date; reportingManagerId?: string }) {
  return { id: user.id, name: user.name, email: user.email ?? "", phoneE164: user.phoneE164 ?? "", role: user.role, branchId: user.branchId, moduleAccess: user.moduleAccess, status: user.status, reportingManagerId: user.reportingManagerId ?? "", createdAt: user.createdAt };
}
