import { HttpError, type Identity } from "./permissions";

export function lifecycleCapabilities(actor: Pick<Identity, "role" | "moduleAccess">) {
  const owner = actor.role === "SUPER_ADMIN";
  const canCashier = owner || actor.moduleAccess.includes("POS_CASHIER");
  return { canCashier, canPrepare: owner || actor.moduleAccess.includes("POS_KITCHEN"), canCancel: owner || (actor.role === "BRANCH_MANAGER" && canCashier) };
}
export function revisionGuard(current: number, expected: unknown) {
  if (!Number.isSafeInteger(expected) || Number(expected) < 1) throw new HttpError(400, "expectedRevision must be a positive integer");
  if (current !== expected) throw new HttpError(409, "Stale revision; reload the current work");
}
export function ticketTransition(actor: Pick<Identity, "role" | "moduleAccess">, status: string, action: unknown, revision: number, expected: unknown) {
  const caps = lifecycleCapabilities(actor);
  if (typeof action !== "string" || !["START", "READY", "SERVE"].includes(action)) throw new HttpError(400, "Invalid ticket action");
  if (action === "SERVE" ? !caps.canCashier : !caps.canPrepare) throw new HttpError(403, "Ticket action permission required");
  revisionGuard(revision, expected);
  const next = action === "START" && status === "SENT" ? "PREPARING" : action === "READY" && status === "PREPARING" ? "READY" : action === "SERVE" && status === "READY" ? "SERVED" : null;
  if (!next) throw new HttpError(409, "Ticket transition is not allowed");
  return next;
}
