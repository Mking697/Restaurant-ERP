import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { branches } from "@/db/schema/platform";
import { users } from "@/db/schema/auth";
import {
  recurringTaskDefinitions,
  recurringStatusEnum,
  taskFrequencyEnum,
  taskInstances,
  taskPriorityEnum,
  taskProofs,
  taskStatusEnum,
  taskTypeEnum,
} from "@/db/schema/tasks";
import type { Executor } from "./auth";
import { HttpError, branchScope, hasModule, type Identity } from "./permissions";

// ---------------------------------------------------------------------------
// Shared small helpers (self-contained, matching expenses.ts's convention of
// each domain module owning its own tiny validators rather than importing a
// sibling domain's — e.g. workforce-policy.ts is deliberately NOT reused here).
// ---------------------------------------------------------------------------

export function allowedFields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new HttpError(400, "Unknown field");
}

function text(value: unknown, field: string, min = 1, max = 500): string {
  if (typeof value !== "string" || value.length > max || value.trim().length < min) throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}
function optionalText(value: unknown, field: string, max = 2000): string {
  if (value === undefined || value === null || value === "") return "";
  return text(value, field, 1, max);
}
export function requiredBranchId(actor: Identity, requested: unknown): string {
  if (typeof requested !== "string" || !requested.trim()) throw new HttpError(400, "branchId required");
  return branchScope(actor, requested.trim())!;
}
export function optionalBranchId(actor: Identity, requested: unknown): string | null {
  if (requested === null || requested === undefined || requested === "") return branchScope(actor, null);
  if (typeof requested !== "string") throw new HttpError(400, "Invalid branchId");
  return branchScope(actor, requested);
}
function dateTimeField(value: unknown, field: string): Date {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `Invalid ${field}`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, `Invalid ${field}`);
  return parsed;
}
function shiftTimeField(value: unknown): string {
  if (value === undefined) return "09:00";
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new HttpError(400, "Invalid shiftTime");
  return value;
}
function boolField(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new HttpError(400, "Invalid flag");
  return value;
}
function enumField<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) throw new HttpError(400, `Invalid ${field}`);
  return value as T;
}
async function assertBranch(tx: Executor, branchId: string) {
  if (!(await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1)).length) {
    throw new HttpError(404, "Branch not found");
  }
}
async function assertAssigneeInBranch(tx: Executor, branchId: string, userId: string) {
  const [row] = await tx.select({ id: users.id, branchId: users.branchId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row || row.branchId !== branchId) throw new HttpError(400, "assignedToId must be a user in the same branch");
}
// Creation grants only: CHECKLISTS-only viewers must not gain a user directory.
export async function listAssignees(tx: Executor, actor: Identity, branchQuery: unknown) {
  if (!hasModule(actor, "TASKS_RECURRING") && !hasModule(actor, "TASKS_DELEGATION")) throw new HttpError(403, "Module access required");
  const branchId = requiredBranchId(actor, branchQuery);
  await assertBranch(tx, branchId);
  const assignees = await tx.select({ id: users.id, name: users.name }).from(users)
    .where(eq(users.branchId, branchId)).orderBy(users.name, users.id);
  return { branchId, assignees };
}

export function canManageTasks(actor: Identity) {
  return hasModule(actor, "TASKS_RECURRING") || hasModule(actor, "TASKS_DELEGATION") || hasModule(actor, "CHECKLISTS");
}
export function assertCanComplete(actor: Identity, row: { assignedToId: string; type: string }) {
  if (row.assignedToId === actor.id) return;
  const grant = row.type === "ONE_TIME" ? "TASKS_DELEGATION" : "TASKS_RECURRING";
  if (!hasModule(actor, grant)) throw new HttpError(403, "Only the assignee or a grant holder may complete this task");
}
// Pure rule, exported separately so it is unit-testable without a database:
// ONE_TIME (delegation) tasks REQUIRE non-empty evidence to complete; RECURRING does not.
export function assertAttachmentForComplete(type: string, attachmentUrl: string) {
  if (type === "ONE_TIME" && !attachmentUrl) throw new HttpError(400, "Evidence attachment is required to complete a delegated (one-time) task");
}

// ---------------------------------------------------------------------------
// DTO shapes — joined with the doer's name and branch name/code so the UI
// doesn't need a second round-trip; recurring/instances tables never store
// those directly (only ids), matching the rest of this schema's convention.
// ---------------------------------------------------------------------------

const recurringDtoColumns = {
  id: recurringTaskDefinitions.id,
  branchId: recurringTaskDefinitions.branchId,
  title: recurringTaskDefinitions.title,
  description: recurringTaskDefinitions.description,
  assignedToId: recurringTaskDefinitions.assignedToId,
  assignedById: recurringTaskDefinitions.assignedById,
  frequency: recurringTaskDefinitions.frequency,
  assignDate: recurringTaskDefinitions.assignDate,
  shiftTime: recurringTaskDefinitions.shiftTime,
  attachmentHint: recurringTaskDefinitions.attachmentHint,
  requiresGeofence: recurringTaskDefinitions.requiresGeofence,
  status: recurringTaskDefinitions.status,
  createdAt: recurringTaskDefinitions.createdAt,
  assignedToName: users.name,
  branchName: branches.name,
};
async function recurringDTO(tx: Executor, id: string) {
  const [row] = await tx.select(recurringDtoColumns).from(recurringTaskDefinitions)
    .innerJoin(users, eq(users.id, recurringTaskDefinitions.assignedToId))
    .innerJoin(branches, eq(branches.id, recurringTaskDefinitions.branchId))
    .where(eq(recurringTaskDefinitions.id, id));
  return row;
}

const instanceDtoColumns = {
  id: taskInstances.id,
  recurringDefinitionId: taskInstances.recurringDefinitionId,
  branchId: taskInstances.branchId,
  type: taskInstances.type,
  title: taskInstances.title,
  description: taskInstances.description,
  assignedToId: taskInstances.assignedToId,
  delegatedById: taskInstances.delegatedById,
  priority: taskInstances.priority,
  voiceNoteUrl: taskInstances.voiceNoteUrl,
  dueAt: taskInstances.dueAt,
  status: taskInstances.status,
  completedAt: taskInstances.completedAt,
  attachmentUrl: taskInstances.attachmentUrl,
  createdAt: taskInstances.createdAt,
  assignedToName: users.name,
  branchName: branches.name,
};
async function instanceDTO(tx: Executor, id: string) {
  const [row] = await tx.select(instanceDtoColumns).from(taskInstances)
    .innerJoin(users, eq(users.id, taskInstances.assignedToId))
    .innerJoin(branches, eq(branches.id, taskInstances.branchId))
    .where(eq(taskInstances.id, id));
  return row;
}

// ---------------------------------------------------------------------------
// Recurring task definitions — the "rule". Cron-based generation of actual
// occurrences from these rules is explicitly OUT OF SCOPE for this pass.
// ---------------------------------------------------------------------------

export async function createRecurring(tx: Executor, actor: Identity, input: Record<string, unknown>) {
  if (!hasModule(actor, "TASKS_RECURRING")) throw new HttpError(403, "Module access required");
  allowedFields(input, ["branchId", "title", "description", "assignedToId", "frequency", "assignDate", "shiftTime", "attachmentHint", "requiresGeofence"]);
  const branchId = requiredBranchId(actor, input.branchId);
  await assertBranch(tx, branchId);
  const title = text(input.title, "title", 1, 200);
  const description = optionalText(input.description, "description");
  const assignedToId = text(input.assignedToId, "assignedToId");
  await assertAssigneeInBranch(tx, branchId, assignedToId);
  const frequency = enumField(input.frequency, "frequency", taskFrequencyEnum.enumValues);
  const assignDate = dateTimeField(input.assignDate, "assignDate");
  const shiftTime = shiftTimeField(input.shiftTime);
  const attachmentHint = boolField(input.attachmentHint, true);
  const requiresGeofence = boolField(input.requiresGeofence, true);
  const id = randomUUID();
  await tx.insert(recurringTaskDefinitions).values({
    id, branchId, title, description, assignedToId, assignedById: actor.id, frequency, assignDate, shiftTime,
    attachmentHint, requiresGeofence, status: "Active",
  });
  return { recurring: await recurringDTO(tx, id) };
}

export async function listRecurring(tx: Executor, actor: Identity, branchQuery: unknown) {
  if (!hasModule(actor, "TASKS_RECURRING")) throw new HttpError(403, "Module access required");
  const branchId = optionalBranchId(actor, branchQuery);
  const rows = await tx.select(recurringDtoColumns).from(recurringTaskDefinitions)
    .innerJoin(users, eq(users.id, recurringTaskDefinitions.assignedToId))
    .innerJoin(branches, eq(branches.id, recurringTaskDefinitions.branchId))
    .where(branchId ? eq(recurringTaskDefinitions.branchId, branchId) : undefined)
    .orderBy(desc(recurringTaskDefinitions.createdAt));
  return { recurring: rows };
}

export async function updateRecurringStatus(tx: Executor, actor: Identity, id: string, input: Record<string, unknown>) {
  if (!hasModule(actor, "TASKS_RECURRING")) throw new HttpError(403, "Module access required");
  allowedFields(input, ["status"]);
  const status = enumField(input.status, "status", recurringStatusEnum.enumValues);
  const [row] = await tx.select().from(recurringTaskDefinitions).where(eq(recurringTaskDefinitions.id, id));
  if (!row) throw new HttpError(404, "Recurring task not found");
  branchScope(actor, row.branchId);
  await tx.update(recurringTaskDefinitions).set({ status }).where(eq(recurringTaskDefinitions.id, id));
  return { recurring: await recurringDTO(tx, id) };
}

// ---------------------------------------------------------------------------
// Task instances — one-time delegation now; RECURRING-type rows would be the
// generator's output later (not created by any route in this pass).
// ---------------------------------------------------------------------------

export async function createDelegate(tx: Executor, actor: Identity, input: Record<string, unknown>) {
  if (!hasModule(actor, "TASKS_DELEGATION")) throw new HttpError(403, "Module access required");
  allowedFields(input, ["branchId", "title", "description", "assignedToId", "priority", "dueAt", "voiceNoteUrl"]);
  const branchId = requiredBranchId(actor, input.branchId);
  await assertBranch(tx, branchId);
  const title = text(input.title, "title", 1, 200);
  const description = optionalText(input.description, "description");
  const assignedToId = text(input.assignedToId, "assignedToId");
  await assertAssigneeInBranch(tx, branchId, assignedToId);
  const priority = enumField(input.priority, "priority", taskPriorityEnum.enumValues);
  const dueAt = dateTimeField(input.dueAt, "dueAt");
  const voiceNoteUrl = optionalText(input.voiceNoteUrl, "voiceNoteUrl");
  const id = randomUUID();
  await tx.insert(taskInstances).values({
    id, branchId, type: "ONE_TIME", title, description, assignedToId, delegatedById: actor.id, priority, dueAt,
    voiceNoteUrl, status: "PENDING",
  });
  return { instance: await instanceDTO(tx, id) };
}

export async function listInstances(tx: Executor, actor: Identity, branchQuery: unknown, typeQuery: unknown, statusQuery: unknown) {
  const branchId = optionalBranchId(actor, branchQuery);
  const type = typeQuery === null || typeQuery === undefined || typeQuery === "" ? undefined : enumField(typeQuery, "type", taskTypeEnum.enumValues);
  const status = statusQuery === null || statusQuery === undefined || statusQuery === "" ? undefined : enumField(statusQuery, "status", taskStatusEnum.enumValues);
  const manage = canManageTasks(actor);
  const condition = and(
    branchId ? eq(taskInstances.branchId, branchId) : undefined,
    type ? eq(taskInstances.type, type) : undefined,
    status ? eq(taskInstances.status, status) : undefined,
    manage ? undefined : eq(taskInstances.assignedToId, actor.id),
  );
  const rows = await tx.select(instanceDtoColumns).from(taskInstances)
    .innerJoin(users, eq(users.id, taskInstances.assignedToId))
    .innerJoin(branches, eq(branches.id, taskInstances.branchId))
    .where(condition)
    .orderBy(taskInstances.dueAt);
  return { instances: rows };
}

export async function completeInstance(tx: Executor, actor: Identity, id: string, input: Record<string, unknown>) {
  allowedFields(input, ["attachmentUrl"]);
  const [row] = await tx.select().from(taskInstances).where(eq(taskInstances.id, id));
  if (!row) throw new HttpError(404, "Task not found");
  branchScope(actor, row.branchId);
  assertCanComplete(actor, row);
  if (row.status === "DONE") throw new HttpError(409, "Task already marked done");
  const attachmentUrl = optionalText(input.attachmentUrl, "attachmentUrl");
  // EVIDENCE-1: a real uploaded photo (task_proofs row, via POST .../evidence)
  // satisfies the ONE_TIME attachment requirement exactly like the older
  // client-supplied attachmentUrl text/URL path did — check it BEFORE
  // rejecting, and fall back to its real Blob pathname as the stored
  // attachmentUrl so instanceDTO/readers see one consistent value either way.
  const [proof] = await tx.select({ photoUrl: taskProofs.photoUrl }).from(taskProofs).where(eq(taskProofs.taskInstanceId, id));
  const effectiveAttachment = attachmentUrl || proof?.photoUrl || row.attachmentUrl;
  assertAttachmentForComplete(row.type, effectiveAttachment);
  await tx.update(taskInstances).set({ status: "DONE", completedAt: new Date(), attachmentUrl: effectiveAttachment }).where(eq(taskInstances.id, id));
  return { instance: await instanceDTO(tx, id) };
}

// ---------------------------------------------------------------------------
// EVIDENCE-1 — real camera-photo evidence (blob I/O lives in task-evidence.ts;
// this module only ever touches Postgres, matching every other domain file's
// separation of concerns). Upload permission mirrors assertCanComplete (the
// assignee or a TASKS_DELEGATION/TASKS_RECURRING grant holder, scoped to the
// task's own branch) since uploading evidence is part of the completion flow;
// read permission mirrors listInstances' self-vs-grant visibility rule.
// ---------------------------------------------------------------------------

export async function loadInstanceForEvidence(tx: Executor, actor: Identity, id: string, mode: "write" | "read") {
  const [row] = await tx.select().from(taskInstances).where(eq(taskInstances.id, id));
  if (!row) throw new HttpError(404, "Task not found");
  branchScope(actor, row.branchId);
  if (mode === "write") {
    assertCanComplete(actor, row);
    if (row.status === "DONE") throw new HttpError(409, "Task already marked done; evidence cannot be changed after completion");
  } else if (row.assignedToId !== actor.id && !canManageTasks(actor)) {
    throw new HttpError(403, "Only the assignee or a grant holder may view this task's evidence");
  }
  return row;
}

export async function loadBranchForGeofence(tx: Executor, branchId: string) {
  const [branch] = await tx.select({ lat: branches.lat, lng: branches.lng, geofenceRadiusM: branches.geofenceRadiusM }).from(branches).where(eq(branches.id, branchId));
  if (!branch) throw new HttpError(404, "Branch not found");
  return branch;
}

const proofDtoColumns = {
  taskInstanceId: taskProofs.taskInstanceId,
  withinGeofence: taskProofs.withinGeofence,
  distanceFromBranchM: taskProofs.distanceFromBranchM,
  createdAt: taskProofs.createdAt,
};

export async function upsertTaskProof(tx: Executor, taskInstanceId: string, photoUrl: string, geofence: { withinGeofence: boolean | null; distanceFromBranchM: number | null }, lat: number | null, lng: number | null) {
  const existing = await tx.select({ id: taskProofs.id }).from(taskProofs).where(eq(taskProofs.taskInstanceId, taskInstanceId)).limit(1);
  const values = {
    photoUrl,
    lat: lat === null ? null : String(lat),
    lng: lng === null ? null : String(lng),
    distanceFromBranchM: geofence.distanceFromBranchM === null ? null : String(geofence.distanceFromBranchM),
    withinGeofence: geofence.withinGeofence,
    exifTimestamp: new Date(),
  };
  if (existing.length) {
    await tx.update(taskProofs).set(values).where(eq(taskProofs.taskInstanceId, taskInstanceId));
  } else {
    await tx.insert(taskProofs).values({ id: randomUUID(), taskInstanceId, ...values });
  }
  await tx.update(taskInstances).set({ attachmentUrl: photoUrl }).where(eq(taskInstances.id, taskInstanceId));
  const [proof] = await tx.select(proofDtoColumns).from(taskProofs).where(eq(taskProofs.taskInstanceId, taskInstanceId));
  return proof;
}

export async function getTaskProof(tx: Executor, taskInstanceId: string) {
  const [proof] = await tx.select({ photoUrl: taskProofs.photoUrl, ...proofDtoColumns }).from(taskProofs).where(eq(taskProofs.taskInstanceId, taskInstanceId));
  return proof ?? null;
}
