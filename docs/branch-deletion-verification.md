# UX-1a branch-deletion verification — October 30, 2026

Status: COMPLETE — LOCAL FUNCTIONAL ACCEPTANCE. Parent functional gates and independent scoped review passed. Local/uncommitted only. This is the branch-delete precheck/warning slice, NOT all of UX-1.

## Implemented

- Owner-only `GET /api/branches/[id]/deletion-check`; strict no-query admission, missing branch404, counts-only `{branchId,canDelete,dependencies:[{group,count}]}`. Non-Owners cannot inspect even their own branch's dependency counts.
- Dependency registry derives every direct branch FK from installed Drizzle table metadata. Includes nullable columns, inline and extra-config references; multiple branch-reference columns count each row once. Coverage test compares every exported schema file; unsupported key shapes/count corruption fail closed.
- Existing Owner/CSRF/mutate DELETE recomputes dependency counts in its transaction before attempting deletion. Linked data returns understandable409 with no cleanup/reassignment. Empty deletion remains possible through existing API; foreign keys remain final race protection. No schema or cascade behavior changed.
- Existing Edit Branch dialog has lazy, read-only Owner check/retry with bilingual snapshot warning. No delete button introduced. Identity/branch/list/loading/error transitions discard stale results and do not grant Branch Admin counts.
- English/Hinglish source guides and standalone HTML synchronized.

## Parent-run gates

- Full `node --test tests/*.test.cjs`: 315/315, no failures/skips.
- Focused `node --test tests/branch-deletion.test.cjs tests/branch-deletion-ui.test.cjs`: 16/16, named output checked.
- Project `tsc --noEmit --incremental false`: clean before build and after QA cleanup.
- Isolated `.next-branchbuild` production build completed, tracked process exit0.
- Guarded `tests/branch-deletion.integration.cjs`: 9/9 on dev4320 and compiled4321. Each count includes eight acceptance groups plus exact fixture-cleanup readback.
- First dev attempt timed out on cold route compilation (~20 seconds) before app marker readback; exact finally cleanup passed. Warmed anonymous routes, then reran the unchanged suite successfully. This was not hidden or converted into a pass.
- Real DB assertions: random app/DB marker binding; anonymous/staff/admin denials; query/missing404; exact groups for users, inventory, workforce/compensation, shifts, nullable warehouses/ledger; GET no-write; rejected linked DELETE preserves exact snapshots; empty/HQ-null isolation; new dependency after clear snapshot forces fresh409; existing empty API deletion persists and repeat returns404. This sequence is not a claim of a reproduced concurrent Postgres scheduling race. FK no-action/restrict catalog assertions and mocked final-FK409 are supplemental coverage.
- Guide parity: 9/9 (also within full suite). Static selected-file security scan reported no flagged patterns across the 17 changed/new TS/TSX/CJS files; source review confirmed parameterized Drizzle query composition.

## Browser acceptance

Dedicated dev app and disposable synthetic Owner session (not login-form/password testing): Edit linked branch, no eager result, click Check deletion readiness, see linked warning and exact `users: 1`. No delete control. Close and open empty branch: old linked result absent, explicit check shows no linked records and warns that readiness is not permission to delete. Hinglish linked warning verified. Own-branch Branch Admin can edit but sees neither readiness action nor counts. Independent exact PostgreSQL readback confirmed both branches/users preserved by these browser reads.

390x844: page width390, dialog x16/right374/width358, height717.39 within viewport. No pixel-level screenshot acceptance claimed; browser automation initially timed out on cold navigation, and reopening the warmed route in a new tab recovered DOM checks. Exhaustive visual/device QA remains UX-1. Compiled acceptance is HTTP/PG, not a claimed compiled-browser click-through.

## Isolation and cleanup

Dedicated newly created database `restaurant_erp_branch_delete_qa_20261030` on 127.0.0.1:5436, migrated using existing chain only. No shared local/production business data. Own servers stopped; no listeners4320/4321. Exact HTTP/browser fixture cleanup read back zero branches/users/sessions/stock/employees/compensation/shifts/warehouses/ledger accounts. Empty migrated QA DB retained. Browser session revoked and manifest removed; QA dist directories removed. `tsconfig.json` and `next-env.d.ts` diff-clean; final typecheck/diff check exit0.

## Remaining

Independent reviewer `deleg_79df9d8b` passed without blocking security/logic findings and independently ran 16/16 focused tests. Nonblocking suggestion: explicitly test branch-list loading/error transitions and Owner grant changes (implementation already masks/remounts these). Reviewer did not run DB/build/browser; those are parent evidence above. Historical selector pagination, Clone Branch Wizard (deferred) and exhaustive desktop/laptop/tablet/mobile/pixel QA are not closed here. No production, dependency, financial posting, attachment storage or automation change. See `branch-deletion-contract.md` and `pending-work-resume-20261030.md`; protected CLAUDE.md update remains blocked and was not bypassed.
