import { HttpError } from "./permissions";

export type HoReviewAction = "ACKNOWLEDGE" | "ESCALATE";
export type HoSubjectType = "GRN" | "EOD_STOCK";
export function hoSubjectIdentity(type: HoSubjectType, sourceId: string, revision: number): string {
  if (!sourceId || !Number.isInteger(revision) || revision < 1) throw new HttpError(500, "Invalid HO review subject identity");
  return `${type}:${sourceId}:r${revision}`;
}
export type HoReviewEventState = { action: HoReviewAction; createdAt: Date | string };

export function latestHoReviewEvent<T extends HoReviewEventState>(events: T[]): T | null {
  return events.reduce<T | null>((latest, event) => {
    if (!latest) return event;
    return new Date(event.createdAt).getTime() > new Date(latest.createdAt).getTime() ? event : latest;
  }, null);
}

export function isHoSubjectResolved(events: HoReviewEventState[]): boolean {
  return events.some((event) => event.action === "ACKNOWLEDGE");
}

export function parseHoReviewAction(input: Record<string, unknown>): { action: HoReviewAction; actionKey: string; reason: string } {
  if (Object.keys(input).some((key) => !["action", "actionKey", "reason"].includes(key))) throw new HttpError(400, "Unexpected field");
  if (input.action !== "ACKNOWLEDGE" && input.action !== "ESCALATE") throw new HttpError(400, "action must be ACKNOWLEDGE or ESCALATE");
  if (typeof input.actionKey !== "string" || !input.actionKey.trim() || input.actionKey.length > 200) throw new HttpError(400, "actionKey is required");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length > 1000) throw new HttpError(400, "reason is too long");
  if (input.action === "ESCALATE" && !reason) throw new HttpError(400, "Escalation reason is required");
  return { action: input.action, actionKey: input.actionKey.trim(), reason };
}
