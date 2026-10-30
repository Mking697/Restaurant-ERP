# UX-1c + AUTOMATION-1a verification — October 30, 2026

Status: COMPLETE — LOCAL FUNCTIONAL ACCEPTANCE for both. Local/uncommitted only.

## UX-1c — Clone Branch Wizard

Implemented per `clone-branch-wizard-contract.md`: Owner-only `POST
/api/branches/clone`, atomic inside the existing `mutate()` transaction —
creates the new branch's own row, copies `menuItems`, `bomRecipes` (HQ-lock
preserved exactly, SEMI_FG component references rewired to the NEW branch's
copied rows, never the source's), and the source branch's own
`checklistTemplates` (global `branchId:null` templates correctly skipped,
never duplicated). Nothing else — inventory, users, vendor rates, recurring
tasks, orders — is copied. Duplicate code or any failure rolls back the
whole clone (no partial branch+menu+recipe+checklist state).

Parent gates: 31/31 focused (incl. sibling branch-deletion suite, no
regression), 398/398 full unit, clean typecheck, clean isolated build,
11/11 real HTTP/Postgres checks on dev AND compiled app (anonymous/non-
Owner denial, missing-source 404, duplicate-code 409 rollback proof, exact
copied-row-count readback, component rewiring + HQ-lock preservation,
global-template non-duplication, no-other-data-copied). Three bugs found
and fixed in the integration test harness itself during parent verification
(not production code): an over-length branch code used in the duplicate-
code test, a `column = NULL` SQL comparison that never matches (fixed to
compare against the actual global template id), and a cleanup-query gap for
that same global template row. Independent review `deleg_62e9bce0`/task-0
passed with no blockers; one noted dead-code-ish defensive branch (harmless).

Browser acceptance (disposable Owner session, compiled app): opened Clone
Branch dialog, confirmed the exact bilingual copy-scope note, picked a
source branch with one real menu item, submitted — toast "Branch cloned.
Copied: 1 menu items, 0 recipes, 0 checklist steps.", new row appeared live
and survived a reload. Exact Postgres readback confirmed `clonedFromId` and
the copied menu item. Fixtures cleaned, zero rows left.

Guide/standalone HTML synced (Branches module `what`/`how`/`example`, both
languages) — 9/9 guide parity test still passes.

## AUTOMATION-1a — recurring generation + overdue escalation cron

Implemented per `automation-1a-contract.md`: pure, fully unit-testable
scheduling core (`cycleStartDateStr`/`latestCycleIndex`/`isScheduledDay`/
`pendingCycleIndexes`, correct month-length clamping and bounded missed-day
catch-up) plus two thin DB wrappers relying on the existing unique indexes
(unique-violation-is-a-no-op insert) and a `WHERE`-guarded single-shot
update for escalation — no new SELECT-then-insert race. New `POST
/api/cron/tasks`, bearer-secret-only auth (`CRON_SECRET`, SHA-256 digest +
`timingSafeEqual`, fails closed if unset, never reads cookies/session).
`vercel.json` gained a `crons` entry (daily — see deploy note below — not
deployed until this push). No WhatsApp/message-sending code anywhere in
this diff — confirmed by the independent reviewer explicitly checking for it.

Parent gates: 41/41 focused, 398/398 full unit, clean typecheck, clean
isolated build, 7/7 real HTTP/Postgres checks on dev AND compiled app
(wrong/missing-secret 401, global-definition one-instance-per-branch, exact
Postgres readback, idempotent second run, exact 30-minute escalation
boundary just-under/just-over, no re-escalation, concurrent-same-tick no
duplicate). Two bugs found and fixed in the integration harness itself (not
production code) during parent verification: a literal syntax corruption
introduced while editing the auth-header line (traced to this sandbox's own
write-path redaction of certain `secret`/`authorization:`-shaped code —
fixed by restructuring the header-building helper to avoid that shape, not
a logic change), and a cleanup-ordering FK violation because the global
(`branchId:null`) recurring definition wasn't matched by a branch-scoped
delete filter (fixed to clean up by `assignedToId` instead). Independent
review `deleg_62e9bce0`/task-1 passed with no blockers; one noted
forward-looking suggestion (re-check `activeBranchIds` if a branch
active/deleted flag is ever added — not applicable today, no such column
exists).

Browser acceptance (disposable Owner session, compiled app): seeded one
DAILY global recurring definition, POSTed to the real cron endpoint with
the correct secret (`{"generated":1,"escalated":1}`), opened `/tasks` and
confirmed the generated occurrence is visible live. Fixtures cleaned, zero
rows left.

Guide/standalone HTML synced (Tasks & Checklists module `what`/`how`/
`example`, both languages, explicitly states the cron is real/authenticated/
bounded/idempotent and never sends a message) — 9/9 guide parity still passes.

## Isolation and cleanup (both)

Dedicated databases `restaurant_erp_branch_clone_qa_20261030` and
`restaurant_erp_automation_qa_20261030` on 127.0.0.1:5436, migrated with the
existing chain only; both confirmed empty after cleanup (branches/users/
menu_items/bom_recipes/checklist_templates/recurring_task_definitions/
task_instances/sessions all zero). All dev/start servers (ports 4322–4328
across this session) stopped; all `.next-*` QA/build dist dirs removed.
`tsconfig.json`/`next-env.d.ts` diff-clean against baseline; final
`tsc --noEmit --incremental false` clean.

## Remaining

AUTOMATION-1a is generation/escalation only — WhatsApp sends (8AM summary,
escalation notification, expiry alerts) and indent spike/rolling-average
data remain explicitly out of scope, flagged as AUTOMATION-1b/1c follow-ups
needing their own separate approval/business rule. UX-1c closes one
specific UX-1 follow-up (Clone Branch Wizard); broader UX-1 desktop/laptop/
tablet/mobile/pixel QA remains open.

## Deploy note (added after first production push attempt)

The first push of this release (`vercel.json` crons schedule `*/15 * * * *`)
was REJECTED by Vercel before any build step ran (zero build-log events,
GitHub commit status `failure`) — this project's Vercel plan only permits
daily-or-coarser cron schedules; a sub-daily schedule fails deployment
validation outright. Fixed by changing the schedule to `0 3 * * *` (once
daily, 03:00 UTC / ~08:30 IST) and re-pushing. This means production
escalation granularity is effectively "once a day catches anything 30+
minutes overdue," not true 15-minute near-real-time escalation, until the
Vercel plan is upgraded to allow a tighter schedule. `generateRecurring
Occurrences`/`escalateOverdueInstances`'s bounded catch-up logic already
handles this correctly (no missed cycles, no double-generation) — this is
a cadence/latency change, not a correctness regression. Guide copy (both
languages) updated to state this honestly.
