# TASKS-1 verification — October 30, 2026

Status: COMPLETE — LOCAL FUNCTIONAL ACCEPTANCE. Parent gates and independent scoped review passed. Local/uncommitted only. No production actions, new schema, dependency changes or messages.

## Implemented

`GET /api/tasks/assignees?branchId=...` authenticates using the existing live session, admits Owner or TASKS_RECURRING/TASKS_DELEGATION, requires exactly one explicit branch query, enforces branch isolation/existence, and selects only id/name in deterministic name/id order without a discovery cap. CHECKLISTS-only and assignee-only access do not grant a directory. `/api/users` remains unchanged.

Recurring and delegation dialogs now select doers by name. Reads are lazy (dialog open + creation grant + selected branch); selection clears on branch change. Stale/wrong-branch/loading/error/empty results and missing selection block submission. Existing same-branch server validation remains authoritative; existing create eligibility, including inactive user rows, is preserved rather than silently changed.

## Parent-executed evidence

- Full `node --test tests/*.test.cjs`: 299/299 passed, no skips/failures.
- Focused `node --test tests/tasks.test.cjs tests/tasks-assignees.test.cjs tests/tasks-assignees-ui.test.cjs`: 24/24 passed. Includes exported-route admission/strict queries, selected SQL fields/order, actual transpiled UI + real resource/action hooks, lazy reads, branch-reset-before-effects, superseded replies, closed/reopened dialogs and grant/identity remounts.
- Project `tsc --noEmit --incremental false`: clean before and after QA generated-config cleanup.
- Isolated `NEXT_DIST_DIR=.next-tasksbuild next build`: completed with process exit 0; route table includes new endpoint and tasks page.
- Real HTTP/Postgres task suite on dev port 4318: 31/31.
- Same suite on freshly built `next start` port 4319: 31/31.
- Real suites cover anonymous/missing-grant/CHECKLISTS denial, explicit/duplicate/unknown branch queries, missing/empty branches, cross-branch refusal, exact sorted id/name DTO, no widened user-administration access, narrow-grant create using looked-up id with exact committed PostgreSQL readback, and existing task lifecycle regressions.
- Dedicated loopback database `restaurant_erp_tasks_qa_20261030` was newly created after checking absence, migrated through the existing migration chain, and used exclusively for these writes. Shared local/production business data were not used.
- Guide source English/Hinglish and standalone HTML parity: 9/9 guide tests passed (also in full suite).

## Browser evidence and limits

Live dev app, disposable Owner session: opened recurring creation, selected Branch A and Doer Alpha by dropdown, submitted and reloaded; saved row remained. Delegation: selected Alpha in A, switched to B, asserted blank selection and disabled submit, then asserted only Doer Beta was available; selected Beta, submitted and reloaded the delegation tab. Exact PostgreSQL readback confirmed the two titles, branch ids and intended assignee ids.

390x844 delegated dialog: document width 390, dialog x=16/right=374/width=358; no page overflow. A recurring-only cashier session loaded only Branch A choices in Hinglish; no Beta option, missing selection blocked submission. No user-admin grant was added. Browser default session initially timed out; a named isolated session recovered DOM interaction. Screenshot capture itself timed out, so pixel-level visual acceptance is NOT claimed. Wider exhaustive device/visual work remains UX-1. Browser create/reload was dev-app acceptance; compiled acceptance is the real HTTP/Postgres suite, not a claimed compiled-browser run.

## Cleanup

Own QA dev/start processes stopped; ports 4318/4319 had no LISTENING rows. Exact browser and integration fixture rows removed; final dedicated DB readback: branches/users/sessions/task_instances/recurring_task_definitions all 0. Browser session revoked/manifest removed. QA dist directories removed; `tsconfig.json` and `next-env.d.ts` diff-clean. Docker startup also auto-started unrelated restart-policy containers; none were modified/stopped by this task. The empty migrated QA database remains for reuse.

## Remaining boundaries

No cron recurrence/escalation, file upload/camera/GPS, finance posting, actual COGS/labor allocation, invoice/settlement workflow or breaking dependency upgrades are included. Source/contract: `docs/task-assignee-contract.md`.

## Independent review

Reviewer `deleg_0ad9997b` passed the settled scoped implementation with no blocking security or logic findings and independently ran the same 24/24 focused tests. Nonblocking follow-ups: explicit Retry recovery UI test and assignee-specific empty-state guidance. The generated-type cleanup suggestion was already completed by the parent and verified diff-clean; no temporary QA types ship. Pixel-level QA remains UX-1 rather than silently being declared complete.
