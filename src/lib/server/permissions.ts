import { MODULE_KEYS, type ModuleKey } from "../moduleAccess";
export type Role = "SUPER_ADMIN" | "CENTRAL_STORE_MGR" | "BRANCH_MANAGER" | "CASHIER" | "KITCHEN_STAFF";
export interface Identity { id: string; name: string; phoneE164: string; role: Role; branchId: string | null; moduleAccess: string[]; status: "Active" | "Inactive"; }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function assertOwner(user: Identity) { if (user.role !== "SUPER_ADMIN") throw new HttpError(403, "Owner access required"); }
export function hasModule(user: Identity, key: ModuleKey) { return user.role === "SUPER_ADMIN" || user.moduleAccess.includes(key); }
export function assertModule(user: Identity, key: ModuleKey) { if (!hasModule(user, key)) throw new HttpError(403, "Module access required"); }
export function assertUserAdmin(user: Identity) {
  if (user.role !== "SUPER_ADMIN" && user.role !== "BRANCH_MANAGER") throw new HttpError(403, "User administration required");
}
export function branchScope(user: Identity, requested?: string | null): string | null {
  if (user.role === "SUPER_ADMIN") return requested || null;
  if (!user.branchId) throw new HttpError(403, "Branch membership required");
  if (requested && requested !== user.branchId) throw new HttpError(403, "Branch access denied");
  return user.branchId;
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
  if (!target.branchId || !["BRANCH_MANAGER", "CASHIER", "KITCHEN_STAFF"].includes(target.role)) throw new HttpError(403, "Cannot manage HQ roles");
  if (target.moduleAccess.some(key => !actor.moduleAccess.includes(key))) throw new HttpError(403, "Cannot delegate unheld grants");
}
export function safeUser(user: Identity & { createdAt?: Date; reportingManagerId?: string }) {
  return { id: user.id, name: user.name, phoneE164: user.phoneE164, role: user.role, branchId: user.branchId, moduleAccess: user.moduleAccess, status: user.status, reportingManagerId: user.reportingManagerId ?? "", createdAt: user.createdAt };
}
