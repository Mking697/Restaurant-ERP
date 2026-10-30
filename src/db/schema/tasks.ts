import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "./platform";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// HOLIDAY CALENDAR — scheduling skip list for the recurring generator (GAP vs
// original Prisma schema — added to mirror Pro ERP's holiday_list table).
// Natural key is (branchId, date) itself, no surrogate id needed.
// ---------------------------------------------------------------------------

export const holidayCalendar = pgTable(
  "holiday_calendar",
  {
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    date: date("date").notNull(),
    name: text("name").notNull().default(""), // e.g. "Diwali" — readable label only
  },
  (table) => [primaryKey({ columns: [table.branchId, table.date] })]
);

// ---------------------------------------------------------------------------
// RECURRING TASK DEFINITIONS — the "rule"; TaskInstance rows below are each
// generated occurrence. Split out from the old single TaskTemplate (GAP fix:
// Prisma schema only had an RRULE string with no Active/Paused toggle or
// frequency-code vocabulary matching Pro ERP's D/W/15D/M/Q/Y convention).
// ---------------------------------------------------------------------------

export const recurringStatusEnum = pgEnum("recurring_status", ["Active", "Paused"]);

// Fixed frequency vocabulary per the brief: Daily / Weekly / Fortnightly (15
// days) / Monthly / Quarterly / Half-Yearly / Yearly. Closed set -> pgEnum
// (was free text before, which allowed typos like "forthnightly" to silently
// never match the generator's switch statement).
export const taskFrequencyEnum = pgEnum("task_frequency", [
  "DAILY",
  "WEEKLY",
  "FORTNIGHTLY", // every 15 days
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
]);

export const recurringTaskDefinitions = pgTable(
  "recurring_task_definitions",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").references(() => branches.id), // null = global, cloned into branches
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assignedToId: text("assigned_to_id")
      .notNull()
      .references(() => users.id),
    assignedById: text("assigned_by_id")
      .notNull()
      .references(() => users.id),
    frequency: taskFrequencyEnum("frequency").notNull(),
    // Anchor date the generator's isScheduledToday()-equivalent counts every occurrence from.
    assignDate: timestamp("assign_date", { withTimezone: true }).notNull(),
    shiftTime: text("shift_time").notNull().default("09:00"), // "09:00" / "23:00"
    // Attachment is always OPTIONAL for recurring/checklist tasks (per the brief) —
    // this is just whether the UI nudges the doer to attach evidence, never a
    // hard submit-blocker like it is for one-time delegation (see taskInstances
    // below). Kept as a flag (not a bare "always true") so a specific recurring
    // definition can still turn the nudge off entirely if it genuinely has no
    // meaningful evidence to attach.
    attachmentHint: boolean("attachment_hint").notNull().default(true),
    requiresGeofence: boolean("requires_geofence").notNull().default(true),
    status: recurringStatusEnum("status").notNull().default("Active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("recurring_task_definitions_branch_id_idx").on(table.branchId)]
);

// ---------------------------------------------------------------------------
// TASK INSTANCES — one-time delegation OR a generated recurring occurrence.
// naturalCycleStartDate + the two unique indexes make a concurrent/retried
// cron idempotent at the database itself (GAP fix: original schema had no
// such guard, so a double-fired cron could double-create occurrences).
// ---------------------------------------------------------------------------

export const taskTypeEnum = pgEnum("task_type", ["RECURRING", "ONE_TIME"]);
export const taskStatusEnum = pgEnum("task_status", [
  "PENDING",
  "IN_PROGRESS",
  "DONE",
  "OVERDUE",
  "ESCALATED",
  "SKIPPED",
]);
export const taskPriorityEnum = pgEnum("task_priority", ["HIGH", "MEDIUM", "LOW"]);

export const taskInstances = pgTable(
  "task_instances",
  {
    id: text("id").primaryKey(),
    recurringDefinitionId: text("recurring_definition_id").notNull().default(""), // "" = one-off
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    type: taskTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assignedToId: text("assigned_to_id")
      .notNull()
      .references(() => users.id),
    delegatedById: text("delegated_by_id").references(() => users.id), // null for recurring auto-gen
    // Only meaningful for type=ONE_TIME delegation; null for recurring/checklist
    // occurrences, which have no priority concept in the brief.
    priority: taskPriorityEnum("priority"),
    voiceNoteUrl: text("voice_note_url").notNull().default(""),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: taskStatusEnum("status").notNull().default("PENDING"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Doer-submitted evidence (image/PDF) that the work is complete. OPTIONAL
    // for type=RECURRING (checklist/recurring task) — the doer CAN attach but
    // isn't blocked without it. REQUIRED for type=ONE_TIME (delegation) — the
    // app layer must refuse to mark a one-time task DONE with this empty.
    // Enforce the "required for ONE_TIME" rule in the mark-done API handler,
    // not here — a DB CHECK constraint can't see "was this just completed".
    attachmentUrl: text("attachment_url").notNull().default(""),
    overdueEscalatedAt: timestamp("overdue_escalated_at", { withTimezone: true }), // 30-min overdue cron
    // AUTOMATION-1b — one-shot WhatsApp due-reminder guard. Set exactly once,
    // atomically, the first time a cron tick observes dueAt <= now while this
    // is still PENDING/IN_PROGRESS (see claimDueTaskReminders). NULL = no
    // reminder sent yet; never cleared/updated afterward, same immutable-once-
    // set convention as overdueEscalatedAt above.
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    misPenaltyPoints: numeric("mis_penalty_points", { precision: 5, scale: 2 }),
    // Durable per-cycle identity independent of which calendar day the occurrence was
    // actually generated on — a missed cycle carried forward across two different
    // calendar days still resolves to the same value here. NULL for one-off tasks.
    naturalCycleStartDate: date("natural_cycle_start_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("task_instances_branch_status_due_idx").on(table.branchId, table.status, table.dueAt),
    // Same-generation-day guard, scoped to actual recurring rows only.
    uniqueIndex("task_instances_recurring_due_unique")
      .on(table.branchId, table.recurringDefinitionId, table.dueAt)
      .where(sql`${table.recurringDefinitionId} <> ''`),
    // Catches a missed cycle carried forward to two DIFFERENT calendar days.
    uniqueIndex("task_instances_recurring_natural_cycle_unique")
      .on(table.branchId, table.recurringDefinitionId, table.naturalCycleStartDate)
      .where(sql`${table.recurringDefinitionId} <> '' and ${table.naturalCycleStartDate} is not null`),
  ]
);

// EVIDENCE-1 (real implementation): one row per ONE_TIME task instance's
// uploaded completion photo. photoUrl stores the PRIVATE Vercel Blob
// pathname (e.g. "evidence/<branchId>/<taskInstanceId>/<ts>-<rand>.jpg"),
// never a public URL — the store is private, so reads always go through a
// short-lived signed URL (see src/lib/server/task-evidence.ts). lat/lng/
// distanceFromBranchM/withinGeofence are nullable: geolocation is captured
// best-effort client-side and this feature FAILS OPEN — permission denied
// or an unconfigured branch (no real lat/lng yet) must never block task
// completion, and a null here always means "not available", never a
// fabricated true/false. exifTimestamp is set server-side to the upload
// time (not decoded from file EXIF, which browsers strip on file-input
// capture) — kept NOT NULL since the server always knows this.
export const taskProofs = pgTable("task_proofs", {
  id: text("id").primaryKey(),
  taskInstanceId: text("task_instance_id")
    .notNull()
    .unique()
    .references(() => taskInstances.id),
  photoUrl: text("photo_url").notNull(),
  lat: numeric("lat"),
  lng: numeric("lng"),
  distanceFromBranchM: numeric("distance_from_branch_m"),
  withinGeofence: boolean("within_geofence"),
  exifTimestamp: timestamp("exif_timestamp", { withTimezone: true }).notNull(),
  livenessVerified: boolean("liveness_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// CHECKLIST ENGINE — multi-step chaining (GAP vs original schema, added to
// mirror Pro ERP's fms.ts: one template, many steps, each step's outcome can
// route to a different next step). Use for Opening/Closing checklists,
// Hygiene Audits, GRN quality-check chains — anything that is a SEQUENCE of
// steps rather than one flat task.
// ---------------------------------------------------------------------------

export const checklistTemplateStatusEnum = pgEnum("checklist_template_status", ["Active", "Archived"]);
export const checklistOutcomeTypeEnum = pgEnum("checklist_outcome_type", [
  "",
  "DONE",
  "PASS_FAIL",
  "PASS_FAIL_QTY",
  "NUMBER",
  "TEXT",
  "ATTACHMENT",
]);

/**
 * One row per step, grouped by templateId — template metadata (name, trigger,
 * status) repeats on every row of that template rather than living in a
 * separate header row (matches Pro ERP's fms_templates shape).
 */
export const checklistTemplates = pgTable(
  "checklist_templates",
  {
    templateId: text("template_id").notNull(),
    branchId: text("branch_id").references(() => branches.id), // null = global, cloned into branches
    templateName: text("template_name").notNull(),
    // "MANUAL", or an event key like "GRN_CREATED" / "SHIFT_OPEN" / chained
    // "CHECKLIST:<templateId>:<stepNo>:<outcome>".
    triggerEvent: text("trigger_event").notNull().default("MANUAL"),
    status: checklistTemplateStatusEnum("status").notNull().default("Active"),
    stepNo: integer("step_no").notNull(),
    stepName: text("step_name").notNull(),
    assignedToRole: text("assigned_to_role").notNull().default(""), // e.g. "KITCHEN_STAFF"
    tatValue: numeric("tat_value"),
    tatUnit: text("tat_unit").notNull().default(""), // "minutes" | "hours"
    outcomeOptions: text("outcome_options").notNull().default(""), // "Pass,Fail"
    // "Pass:3;Fail:5" style step-routing map — kept jsonb-ready; serialize as real
    // JSON ({"Pass":"3","Fail":"5"}) at the application layer, unlike Pro ERP's
    // legacy semicolon string (flagged there as a known debt, don't repeat it here).
    nextStepMap: jsonb("next_step_map").$type<Record<string, string>>(),
    outcomeType: checklistOutcomeTypeEnum("outcome_type").notNull().default(""),
    requiresPhoto: boolean("requires_photo").notNull().default(true),
    requiresGeofence: boolean("requires_geofence").notNull().default(false),
    // User ids to WhatsApp-notify the moment this step completes, independent of
    // who the NEXT step is assigned to.
    notifyOnComplete: text("notify_on_complete").array().notNull().default([]),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.stepNo] }),
    index("checklist_templates_branch_id_idx").on(table.branchId),
  ]
);

export const checklistRunStatusEnum = pgEnum("checklist_run_status", [
  "PENDING",
  "ON_TIME",
  "DELAY_DONE",
  "SKIPPED",
]);

export const checklistRuns = pgTable(
  "checklist_runs",
  {
    id: text("id").primaryKey(), // one row per step EXECUTION
    instanceId: text("instance_id").notNull(), // groups every step of one run together
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    templateId: text("template_id").notNull(),
    templateName: text("template_name").notNull().default(""),
    // Polymorphic pointer to whatever triggered this run, e.g. "GRN:GRN-xxxx" —
    // deliberately not an FK, it can point at multiple different tables.
    contextRef: text("context_ref").notNull().default(""),
    stepNo: integer("step_no").notNull(),
    stepName: text("step_name").notNull(),
    assignedToId: text("assigned_to_id").references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    tatDeadline: timestamp("tat_deadline", { withTimezone: true }),
    status: checklistRunStatusEnum("status").notNull().default("PENDING"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    outcome: text("outcome").notNull().default(""), // e.g. "Pass" / "Fail"
    proofPhotoUrl: text("proof_photo_url").notNull().default(""),
    remark: text("remark").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("checklist_runs_branch_id_idx").on(table.branchId),
    index("checklist_runs_instance_id_idx").on(table.instanceId),
  ]
);
