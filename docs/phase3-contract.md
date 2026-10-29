# Phase 3 — MIS engine, Dashboard KPIs, Reports real DB wiring

Status: LOCAL IMPLEMENTATION VERIFIED AND SCOPED INDEPENDENT REVIEW ACCEPTED. No production migration/deploy/commit
without separate approval. Builds on Phase 2 (Tasks/Purchase/Accounts-ledger,
already real but not yet committed) and the pre-existing real modules
(POS orders, Inventory, Workforce/Attendance/Payroll, Shift Management).

Ground truth before you start: `mis_scores` table already exists
(`src/db/schema/mis.ts`) with zero API routes. `night_variance_entries`/
`wastage_logs` tables exist (`src/db/schema/inventory.ts`) with zero API
routes. Dashboard/Reports/Performance pages (`src/app/dashboard/page-content.tsx`,
`src/app/reports/[report]/report-content.tsx`, `src/app/performance/page-content.tsx`)
are 100% `mock-data.ts` today. Aggregator Recon and Petty Cash are ALREADY
real as of Phase 2 — the Reports page's "aggregator-recon" report slug
should read from the real `/api/accounts/aggregator-orders` endpoint, not
mock data, if that report slug still exists after your changes.

Shared conventions (same as every prior phase — do not invent a new
pattern): `mutate()`/`locked()` from `@/lib/server/auth` for every write,
`requireIdentity()` for every read, `body()`+explicit allowlist for every
request body, `branchScope()`/`assertModule()` from
`@/lib/server/permissions`, `json()`/`HttpError` from `@/lib/server/http`,
`randomUUID()` ids. Never fabricate a number with no real underlying data —
return an explicit zero/empty/`null` + a flag saying so, matching this
project's own established convention (see Phase 2's `balance-sheet`
`seeded:false` pattern) rather than inventing a plausible-looking fake
metric.

## Settled integration conventions (GPT takeover, October 28, 2026)

- Ground-truth paragraphs below describe the pre-build starting point, not the
  current tree. All Phase 2/3 consumer pages now read real APIs, not mock-data.
- MIS compute timestamps use [periodStart, periodEnd): inclusive start,
  exclusive end. Date-only API values mean IST midnight. Calendar controls
  select 1–31 inclusive IST days and convert the last day to next midnight.
  Date-granular night variance uses the intersecting IST calendar dates;
  calendar-aligned UI windows therefore agree with task/shift timestamps.
- `GET /api/mis/scores` retains contained-window historical reads by default;
  `periodMatch=exact` requires both bounds and matches one selected snapshot
  period for Performance. Reports explicitly displays historical periods and
  labels snapshot comparisons rather than calling them distinct branch ranks.
- The existing nullable-user unique index does NOT deduplicate branch snapshots.
  Shared mutation locking plus select/update-or-insert handles the existing
  branch/period-start storage key. NOT NULL component columns use internal
  -1.00 for missing measurements; public DTOs decode null + coverage/reasons.
  No schema change or migration was required or authorized in this phase.
- Dashboard reuses the permission-checked MIS read helper directly; it does
  not depend on APP_ORIGIN or forward session cookies in a self-HTTP request.
- Underlying grants remain intact: Dashboard trend needs REPORTS; saved MIS
  needs MIS_PERFORMANCE; variance needs INVENTORY; aggregator needs
  AGGREGATOR_RECON. UI sections/cards explain missing prerequisites instead
  of issuing avoidable forbidden requests. No automatic grant widening.
- Current-rate recipe food cost is an estimate, NOT historical posted COGS.
  Period-allocated labor/prime cost and Accounts P&L revenue/COGS remain
  unavailable; no plausible replacement values are generated.

## 3a — MIS Scoring Engine + Inventory Variance/Wastage reporting

This is the FOUNDATION the other half (3b) reads from — build this first,
or at minimum land the `GET /api/mis/scores` route's exact response shape
early so the other agent can build against it without waiting.

- `POST /api/mis/compute` — Owner/CENTRAL_STORE_MGR only. Body:
  `branchId? (omit = all branches), periodStart, periodEnd` (ISO dates,
  periodEnd > periodStart, max 31-day window). For each branch (and, within
  it, aggregated across its users) in range, compute from REAL rows only:
  - **taskScore (40%)**: from `task_instances` in range —
    `onTime = status=DONE and completedAt <= dueAt`, `delay = status=DONE
    and completedAt > dueAt`, `notDone = status in (PENDING,OVERDUE,ESCALATED)
    and dueAt < now`. Score = `onTime / (onTime+delay+notDone) * 100`, or
    `null`/skip the branch if zero tasks exist in range (don't fabricate
    100% or 0% from an empty set).
  - **delegationScore (30%)**: same on-time/delay/not-done logic but
    filtered to `type=ONE_TIME` task instances only (vs taskScore using
    `type=RECURRING` only — these are two different populations per the
    schema comment, don't double-count the same rows in both).
  - **varianceScore (20%)**: from `night_variance_entries` in range —
    `100 - (count of rows with flaggedPilferage=true OR abs(varianceQty) >
    5% of theoreticalQty) / total_rows * 100`, clamped [0,100]. Null/skip if
    zero variance rows exist for that branch in range.
  - **cashierScore (10%)**: from the existing real `shift_runs`/
    `shift_handovers` closing-variance data (reuse, do not reinvent — read
    the existing shift schema/helpers in `src/db/schema/shifts.ts` and
    whatever server helper already computes closing variance for Cash
    Drop) — `100 - (count of runs with nonzero cash variance) / total_runs
    * 100`. Null/skip if zero shift runs closed in range.
  - **totalScore**: weighted sum of the non-null components only,
    re-normalized to 100 (e.g. if only taskScore+delegationScore have real
    data this period, weight them 40/70 and 30/70, not 40/100 and 30/100 —
    state this explicitly in a `componentsUsed` field on the response so a
    period with partial real data is never silently reported as if all 4
    components were measured).
  - Upsert into `mis_scores` (branch-level row, `userId: null`) inside
    `mutate()`. Idempotent re-run for the same branch+period updates the
    existing row, never duplicates. The nullable-user unique index does NOT
    enforce branch-snapshot uniqueness; use locked select/update-or-insert
    rather than assuming a NULL-user ON CONFLICT will fire.
  - Per-user breakdown is a stretch goal only if time permits (the schema
    supports `userId` rows) — the branch-level aggregate is the REQUIRED
    deliverable for Performance/Dashboard to consume.
- `GET /api/mis/scores?branchId=&periodStart=&periodEnd=` — list computed
  rows (branch-scoped for non-Owner), sorted by `totalScore` desc with
  `rank` computed on read (don't bake rank into the stored row, it's
  relative to whatever set is being viewed). This is the exact contract
  the 3b agent should build Dashboard/Performance against.
- `GET /api/inventory/variance?branchId=&from=&to=` — list real
  `night_variance_entries` rows with raw-material/chef names joined, plus
  a summary (`totalVarianceValueInr`, `pilferageFlagCount`). This also
  backs the Reports "inventory-variance" slug.
- Wire `src/app/performance/page-content.tsx` off `mock-data.ts`'s
  `getMisLeaderboard()` onto `GET /api/mis/scores`, keeping the existing
  bar-chart + ranked-table UI shape. Add a small "Compute MIS" Owner-only
  action if the UI needs an explicit trigger (vs. this running via a future
  cron — no cron work in this pass, matches the project's "cron is later
  infra" convention already used for Tasks in Phase 2).
- Tests: unit tests for the weighted-score re-normalization math
  (especially the partial-data case) and the on-time/delay/not-done
  classification boundary; real HTTP+Postgres integration test script
  `tests/mis.integration.cjs` against your OWN isolated QA database+app
  port — cover compute with real task/variance/shift fixture rows,
  idempotent re-compute (no duplicate row), partial-data re-normalization,
  branch scoping, CSRF/auth.

## 3b — Dashboard real KPIs + Reports (sales-trend, food-cost, cash-reconciliation)

Build the `GET /api/mis/scores?branchId=&periodStart=&periodEnd=` contract
from section 3a into your Dashboard/Reports queries as a plain `fetch`/
server-side read — do not duplicate the MIS computation logic here, you
only ever READ `mis_scores`/call `GET /api/mis/scores`, never write it.

- `GET /api/dashboard/kpis?branchId=` (branchId optional = all/compiled for
  Owner) — real aggregation per branch: `revenueToday`/`revenueMtd` from
  `pos_orders` (sum of completed-sale amounts, respecting the existing
  `operationalOrderVisibility()` filter from the Owner-only-privacy work —
  reuse it, don't bypass it), `totalInventoryValueInr` from
  `inventory_stock` joined to the raw material's last known vendor rate (if
  no rate exists for a material, exclude it from the value sum and say so
  in a `ratesMissingForCount` field — never multiply by a fabricated rate),
  `openTasksOverdue` from `task_instances` (`status=OVERDUE` or
  `dueAt<now and status not in (DONE,SKIPPED)`), `misScore` = latest
  `mis_scores.totalScore` for that branch (via 3a's read endpoint/table,
  `null` if never computed yet), `cashVarianceInr` from the latest closed
  `shift_runs`/`shift_handovers` for that branch, `pilferageFlags` = count
  from `night_variance_entries` where `flaggedPilferage=true` in a trailing
  window (e.g. 30 days). `primeCostPercent`/`foodCostPercent` require a
  real COGS figure — if there's no real recipe-cost-to-revenue computation
  wired yet, return `null` for these two with a clear reason rather than
  fabricating a percentage (flag this honestly in your final report if you
  cannot close it this pass — it depends on real vendor rates existing
  on every sold item's recipe, which may not be true in a fresh DB).
- `GET /api/reports/sales-trend?branchId=&days=` — real daily revenue trend
  from `pos_orders` grouped by day, last N days (default 14), replacing
  `getRevenueTrend14d()`.
- `GET /api/reports/food-cost?branchId=&month=` — per-branch food cost %:
  COGS (sum of recipe raw-material cost for items actually sold, using
  existing vendor-rate/BOM-explode helpers if they exist — check
  `src/app/api/bom-recipes/explode/route.ts`'s cost logic before writing
  your own) vs revenue for the month. Same "return null + say why" rule if
  the real cost chain is incomplete for some items (missing vendor rate,
  no recipe) — the response should list which items/materials were
  excluded, not silently understate cost.
- `GET /api/reports/cash-reconciliation?branchId=&from=&to=` — real
  shift-closing variance rows (reuse the existing Shift Management
  schema/helpers, do not reinvent cash-variance math) replacing
  `getCashReconciliation()`.
- Wire `src/app/dashboard/page-content.tsx` (KPI cards, revenue trend +
  channel-split charts, branch drill-down table, pilferage watch list) and
  `src/app/reports/[report]/report-content.tsx`'s `sales-trend`,
  `food-cost`, `cash-reconciliation`, and `mis-scorecard` slugs off
  `mock-data.ts` onto these real routes. If an `aggregator-recon` report
  slug still exists in that file, point it at the already-real
  `/api/accounts/aggregator-orders` from Phase 2 instead of mock data —
  don't leave one slug still faking data while its sibling tabs go real.
  Excel/CSV export buttons on these report pages should export the now-real
  on-screen rows (reuse the existing `downloadCsv`/`ExportButton` helpers,
  don't rebuild export).
- Tests: unit tests for the revenue/COGS aggregation math and the
  "exclude + report why" behavior when rates/recipes are missing; real
  HTTP+Postgres integration test script `tests/dashboard-reports.integration.cjs`
  against your OWN isolated QA database+app port — cover KPIs with real
  POS/inventory/shift/mis fixture rows, branch scoping, missing-data
  honesty (null not fabricated), sales-trend day-grouping correctness,
  CSRF/auth.

## Verification required before reporting any of 3a/3b done

Same checklist as every prior phase: `npx tsc --noEmit --incremental false`
0 errors; `npm test` all passing, no regressions; `npx next build` clean;
`npx drizzle-kit generate` — confirm no unexpected drift, and if a migration
truly is needed say so explicitly (should not be, schema already exists);
real HTTP+Postgres suite against your own isolated QA app+DB (own port, own
`NEXT_DIST_DIR`, own disposable Postgres database — never the shared local
dev DB/port 3000, never production); clean up all your own QA
fixtures/servers/dist dirs; leave `tsconfig.json`/`next-env.d.ts`
diff-clean against the committed version (recurring gotcha on this
project — a QA dist dir name leaking into `tsconfig.json`'s `include`
array — diff both files before finishing). Report exact file paths
touched, exact test counts, and any honest gaps (especially any KPI you
could not make real and why).
