# UX-1a — branch-deletion readiness

Local scope authorized by pending-work resume October 30, 2026. This is one bounded slice of UX-1, not exhaustive visual/device QA or Clone Branch Wizard delivery. No schema, dependency, production operation or new destructive UI flow.

## Contract

- Existing branch DELETE stays Owner-only, CSRF-checked and inside `mutate()`.
- Owner may GET `/api/branches/[id]/deletion-check` to inspect deletion readiness.
- Missing branch is 404; unauthenticated is 401; any non-Owner is 403 (including own-branch admin). No per-record/user/salary/credential details.
- Readiness includes all direct branch foreign-key dependencies, nullable ones included. Determine linked groups and counts using a schema-complete registry or verified schema metadata, not a partial users/inventory-only list. Counts represent direct references, not transitive-record totals.
- `canDelete` is false if any dependency exists. Do not cascade-delete, reassign, mutate related records or hide financial/operational history.
- DELETE recomputes the readiness in its existing mutation transaction; reject 409 with an understandable linked-data message before issuing DELETE. A prior clear snapshot is never permission to skip this check. Foreign keys remain final race protection.
- The current UI has no delete control. Preserve that boundary: expose only a read-only Owner action in Edit Branch to check readiness, not a new delete button.
- Show bilingual loading/error/retry/linked/empty states. Bind results to exact branch/Owner identity, suppress obsolete responses and clear readiness across branch/identity changes. Say it is a snapshot, not a reservation, and that the server rechecks any actual API delete.
- Do not fetch or expose readiness for Branch Admin, new unsaved branch or closed dialog.

## Acceptance

TDD focused helpers/exported routes/UI tests; automated coverage of all direct branch FK columns; parent full tests/typecheck/build; real HTTP/Postgres on dedicated loopback database and dedicated dev/compiled ports; browser Owner vs Branch Admin, linked warning and closed/changed-scope behavior; guide parity; independent scoped review. No production deletion or fixture writes.

## Still pending under UX-1

Clone Branch Wizard remains deferred. Historical purchase/GRN discovery beyond 200 and exhaustive desktop/laptop/tablet/mobile pixel-level acceptance remain open. TASKS-1 Retry recovery test and more specific empty-state guidance are nonblocking follow-ups, not blockers for its accepted local functionality.
