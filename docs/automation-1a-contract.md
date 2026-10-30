# AUTOMATION-1a — recurring task generation + overdue escalation cron

User approved (2026-10-30): build real, authenticated, bounded/idempotent
cron-triggered generation and escalation now; Vercel Cron schedule config
is written to `vercel.json` but NOT deployed this pass (local/uncommitted
only, same as every other pending-work slice). No real WhatsApp message is
ever sent to a customer or staff member in this pass — notification
sending is explicitly OUT of scope here (flag as a separate follow-up);
this slice only creates/escalates `task_instances` rows. No schema change,
no production/dependency/commit/push. Preserve all previously accepted
uncommitted work.

## Scope

1. **Recurring occurrence generation** — for every `recurringTaskDefinitions`
   row with `status='Active'`, decide whether today (IST) is a scheduled
   occurrence day per its `frequency` (DAILY/WEEKLY/FORTNIGHTLY/MONTHLY/
   QUARTERLY/HALF_YEARLY/YEARLY) anchored at `assignDate`, skip a date that
   is in `holidayCalendar` for that branch, and if scheduled and not
   already generated (via the EXISTING `task_instances_recurring_due_unique`
   and `task_instances_recurring_natural_cycle_unique` indexes — rely on a
   unique-violation-is-a-no-op insert, never a prior SELECT-then-insert
   race), insert a new `task_instances` row (`type='RECURRING'`, `dueAt`
   derived from `shiftTime` on the scheduled IST date, `naturalCycleStartDate`
   set to the scheduled cycle's start date even if generation itself runs
   late/catches up a missed day). `branchId: null` (global) definitions
   generate one instance PER active branch, not one global row.
2. **Overdue escalation** — any `task_instances` row still `PENDING` or
   `IN_PROGRESS` more than 30 minutes past `dueAt` with `overdueEscalatedAt`
   null transitions to `status='OVERDUE'` and gets `overdueEscalatedAt`
   set once (idempotent — a second run must not re-escalate or clear it).
   Add a second explicit escalation tier only if trivial; otherwise a
   single OVERDUE transition is sufficient for this slice — do not invent
   an `ESCALATED` transition path without a defined trigger for it.
3. **Cron trigger endpoint** — `POST /api/cron/tasks`. Auth is a single
   shared secret compared via timing-safe equality against
   `Authorization: Bearer <CRON_SECRET>` (new env var, never logged/
   returned). No session/cookie auth — this is a machine-to-machine
   endpoint, explicitly NOT reachable by any browser session regardless of
   role. Missing/wrong secret → 401 with no information disclosure. Runs
   generation then escalation inside the existing `mutate()` lock pattern,
   returns `{generated, escalated}` counts only. Must be safe to invoke
   repeatedly within the same minute (idempotent) and safe to invoke from
   multiple instances concurrently (relies on DB unique constraints /
   `WHERE` guarded updates, not an application-level lock alone).
4. **`vercel.json`** — add a `crons` array entry for `/api/cron/tasks` on a
   reasonable schedule (e.g. every 15 minutes, `*/15 * * * *`) alongside
   the existing `buildCommand`. This is a config file edit only; no deploy
   happens from this pass.

## Explicitly out of scope this pass

- Any WhatsApp send (8AM Owner Coffee Summary, escalation notification,
  batch-expiry alert) — flag as AUTOMATION-1b follow-up once this
  generation/escalation core is accepted.
- Indent spike/rolling-average real data — flag as AUTOMATION-1c, needs a
  defined "rolling average over N days" rule from the user first, same
  category of business-rule gate as FINANCE-1.
- Any schema change — reuse the existing columns/indexes exactly as they
  are; if generation genuinely cannot be made correct/idempotent without a
  schema change, STOP and report that gap rather than quietly changing
  the schema.

## Acceptance

TDD RED→GREEN for the new generator/escalation helpers and the cron route.
Cover: correct scheduling-day decision per frequency against a fixed
"today", holiday skip, one instance per active branch for a global
definition, no duplicate generation on a second same-day run (idempotent),
a missed day's cycle correctly carried forward via `naturalCycleStartDate`
without colliding with the next real day's occurrence, 30-minute escalation
threshold exactness (just-under vs just-over), no re-escalation on a second
run, wrong/missing bearer secret 401, no non-cron (cookie) auth accepted,
concurrent same-tick invocation creates no duplicate rows. Guarded real
HTTP/Postgres integration harness (own disposable QA DB, explicit
`BASE_URL`/PG* — no dotenv default) parent executes: real POST to the cron
route with the correct secret, exact row counts/natural-cycle values read
back from Postgres, a second immediate POST confirms zero new
generated/escalated. Parent gates: full unit suite, typecheck, isolated
build, real HTTP/PG dev+compiled, browser confirmation that a generated
instance appears on `/tasks` after a manual cron POST, guide/standalone-HTML
parity noting this is now real (not mock) generation, independent scoped
review.
