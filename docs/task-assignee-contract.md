# TASKS-1 — branch-scoped assignee selection

Local implementation authorized October 30, 2026. No schema changes, dependency upgrades, production business writes, commit/push or deployment included.

## Admission and privacy

- A dedicated authenticated read endpoint, not a relaxation of `/api/users`.
- Owner or a holder of TASKS_RECURRING or TASKS_DELEGATION may query.
- CHECKLISTS alone, self-assignee access alone and user-administration roles alone do not grant this lookup.
- Explicit branch required, including Owner. Non-Owners are restricted to their own branch. Unknown branches are rejected.
- Return only user id and display name from the requested branch. Do not select or serialize phone, salary, password, session, role/grant or manager details.
- Use deterministic name/id ordering; do not silently truncate the eligible user list.
- Match existing task create eligibility: an existing user in the same branch. This stage does not introduce a new employment/account-status policy.
- Existing server validation remains authoritative on create, including users moved/deleted after lookup.

## UI

Both recurring and delegation creation use a required doer dropdown. Lookup is inactive while closed or without a branch. A branch change clears the selection. Old results must never appear as new-branch choices; loading, lookup errors, empty results and missing/invalid selection block submission. Include bilingual actionable empty/loading/error states and retry. Identity/permission/selected-branch changes preserve the page's existing remount isolation.

## Acceptance

- Unit/route/UI regressions, with observed RED then GREEN for the new behavior.
- Parent-run full unit suite, project typecheck and isolated production build.
- Dedicated migrated loopback QA database and app: authenticated lookup, narrow grants, own/cross-branch cases, exact public DTO, no widened user administration, create using looked-up id and committed readback.
- Browser recurring + delegation create/reload, branch-switch reset and phone geometry.
- English/Hinglish source guides plus standalone guide parity.
- Independent scoped review; record real results and remaining limitations before closing TASKS-1.

Finance posting/reversal rules, actual COGS/labor allocation, automation, uploaded evidence, settlement, dependency upgrades and broader UX acceptance remain separate tracker items.
