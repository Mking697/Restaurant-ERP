# Workforce/Accounts interrupted-stage recovery — 2026-10-22

Current checkout: D:/restaurant erp, branch main, HEAD 9409e71. Existing uncommitted implementation preserved. No commit/push or production write/deployment authorized in this recovery pass.

CLAUDE.md's active checkpoint is older than disk: schema exports and drizzle/0002_young_ego.sql already existed on resume. It must not be read as evidence that no migration file exists. Updating protected CLAUDE.md was blocked by an unanswered approval prompt; do not bypass that protection. This document holds the newer verification checkpoint.

## Verified before follow-up review fixes

- npm test: 75/75 passed.
- Local TypeScript check and full Next production build passed.
- Docker Desktop started on this machine. Historical restaurant container/database absent here; unrelated ravi-erp-pg-live container left stopped and unchanged.
- Created dedicated disposable container restaurant-erp-workforce-resume-qa using postgres:16, bound ONLY to 127.0.0.1:5436. Database restaurant_erp_workforce_qa_20261022, randomly generated QA-only credentials kept in private scratch config (never printed). This is not the ordinary local restaurant database and is not Neon.
- Applied all 3 local migrations using Drizzle's node-postgres migrator; 48 public tables. Existing lineage checked before apply; npm run db:generate reported no schema drift/no new migration.
- QA production-mode server http://localhost:3030, started from the pre-review build.
- Existing workforce integration: 15 checks passed; expenses: 9; auth: 18; branding: 9. Tests adapted only to allow the explicitly guarded workforce QA DB/loopback origin for old auth/branding suites; production targets remain refused.
- Supplemental workforce security/concurrency integration: 7 checks passed, including ACCOUNTANT/HQ scope, linked-user branch/HQ change denial, live identity recheck after queued lock + revocation, overlapping applications, opposite leave reviews, attendance-vs-approval, finalize-vs-attendance, onboarding-vs-empty-run closure.
- Separate disposable upgrade proof: migrate the original 2 migrations (41 tables), insert two legacy branch/manager/grant rows and branding, apply 0002 (48 tables), verify original rows unchanged and all 7 new ledgers empty; new ACCOUNTANT role accepted; repeated migrate idempotent with 3 tracking rows. Upgrade proof database removed afterward.
- Browser QA: create employee linked to self-only identity; inclusive 2024-02-28/29 employment; one PRESENT; missing 29th blocks finalize; self-service has only own leave tab/no salary; self submits 29th leave; different manager explicitly approves PAID; preview and finalized snapshot INR 200.00 for monthly INR 2900.00 in leap February. Real expense INR 123.45 persists; operating report INR 323.45 = expense + final payroll; revenue/COGS/profit remain not connected. Synthetic browser fixtures removed.
- All test fixture table counts were zero after the original runs. Later suites must recheck cleanup.

## Final acceptance — locally verified, NOT deployed

All source writers finished before the final build. The interrupted expenses/attendance/leave/payroll stage is locally accepted, not completion of the entire ERP.

- 91/91 automated tests passed; full project TypeScript check and final Next production build passed. Final post-browser TypeScript and git diff --check passed (only existing LF/CRLF warnings).
- Drizzle generate: 48 tables, no drift/no additional migration. No schema changes were required for the review fixes.
- Restarted QA server from the UPDATED production artifact, loopback-only 127.0.0.1:3030.
- Final real HTTP/Postgres suites: workforce 21 + expenses 9 + security/concurrency 7 + auth 18 + branding 9 = 64 checks passed. The 7-check concurrency suite passed twice more (3 final-build runs total).
- Expanded workforce suite proves historical link freeze, foreign-ID read/write denial, dependent compensation-insert rollback and persisted readback. The on-behalf submitter Owner correctly gets 403 reviewing their request; a third authorized reviewer performs the decision.
- Deliberately injected a queued-lock assertion failure in a scratch copy of the security runner: intended exit 1, pending HTTP request drained after unlocking, fixture counts all zero. No deliberately broken test code left in the repo.

## Completed review fixes and limits

1. requestJson: one 15-second deadline through headers AND body decoding, external cancellation, no automatic retry. Typed RequestJsonError distinguishes admission rejection from unknown outcome; unknown writes warn that the change may already be saved. Six dedicated tests passed, including abort-ignoring transport and stalled JSON.
2. Employee login link: after ANY PENDING/APPROVED/REJECTED leave history, no editor (including Owner) can assign/clear/replace the link. Unchanged link and other safe edits still work. Guard and writes share the mutation lock. Previously altered on-behalf beneficiary links cannot be reconstructed; flexible historical relinking needs a separately approved immutable snapshot migration.
3. Expense recovery: exact attempted payload/key retained per actor/branch/month in sessionStorage. Storage readback required before dispatch; blocked/corrupt storage blocks posting. A replay rejection does not erase an earlier unknown attempt. Pending-key check prevents a replacement panel minting a new key after an old in-flight request completes. Canonical saved text/decimal matching preserves original raw replay spelling. Eight lifecycle tests passed.
4. Bilingual UI/guide/offline examples explain login-link lock and practice prerequisites: same-branch employee login + LEAVE_SELF, ATTENDANCE marker, different LEAVE_APPROVAL reviewer. Payroll page deliberately does not expose empty-run closure; the API can deliberately close empty branch/month runs.

Expense recovery is per browser-tab session, NOT a cross-device/server-side draft: closing the tab/clearing storage/unrelated new tab can lose its journal. Reconcile saved records before recreating an uncertain expense. Arbitrary multi-tab/new-key duplicate-business detection is not claimed.

## Final-build browser evidence

- Let a REAL expense POST commit, consumed its acknowledgment, then injected a synthetic lost-acknowledgment error in a browser transport wrapper. UI reported unknown outcome and retained one recovery journal.
- P&L/Expenses tab switch, month change away/back and full reload preserved original raw text, amount spelling and key. Explicit retry sent a byte-identical payload, returned the existing row and cleared the journal. Reload showed canonical INR 123.40; direct PostgreSQL count was exactly ONE expense. This simulates acknowledgment loss around a real commit, not an actual network outage.
- Accounts and Workforce at 390px: document width remained 390px; Hinglish and Dark work and persist through route navigation. Desktop recovery screenshot checked. Link-history denial is proven by the final real HTTP/PG suite, not claimed as an additional browser edit test.

## Cleanup and next release gate

Synthetic browser fixtures and session cookies removed. Final counts ZERO for branches/users/sessions/branch_expenses/employees/workforce_attendance/workforce_leaves/payroll_runs/payroll_snapshots; recovery journal empty. QA server and dedicated QA container stopped; ports 3030/5436 verified closed. Empty disposable container/database retained for reuse. Private scratch helpers/QA credentials may expire; they are not permanent infrastructure.

Existing Dashboard/Reports/MIS/Tasks/Purchase/POS/Cash Drop remain demos where previously documented. Accounts' old petty cash/reconciliation/balance-sheet tabs remain explicitly labelled demos. No statutory/bank-payment behavior or full sales/COGS/profit integration is claimed.

Commit/push approved after local acceptance; release prepared on feat/accounts-workforce, not main (main auto-deploys). Next: explicit approval for production-target migration and deployment. Apply reviewed 0002 migration BEFORE dependent code deployment. No production fixtures. Existing demo-data/credential cleanup requirements in CLAUDE.md still apply. Protected CLAUDE.md was not updated after its approval timeout; resume from this newer checkpoint.
