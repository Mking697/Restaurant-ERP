# Current local resume — October 30, 2026

Read alongside CLAUDE.md. The protected CLAUDE.md write approval timed out twice; it was not modified or bypassed. Its TASKS-1 pending line is therefore stale. This repo-owned checkpoint records the actual later state.

User authorized completing pending local work. Existing separate-approval boundaries remain: new schema/migrations beyond existing disposable-QA setup, breaking dependency upgrades, paid providers/storage policy, production operations/business writes, and financial posting/reversal decisions. No new commit/push/deploy authorization is inferred.

## TASKS-1 — COMPLETE, local functional acceptance

Secure branch-bound doer lookup/dropdowns delivered. Parent full suite 299/299; focused 24/24; project typecheck and isolated production build clean; real HTTP/Postgres 31/31 on dev and compiled app. Browser recurring/delegation create+reload, branch reset and exact PG assignee readback passed. Narrow recurring Hinglish session and phone geometry checked. Screenshot timeout means no pixel-level claim. Independent scoped reviewer `deleg_0ad9997b` passed without blockers and ran 24/24 focused tests. Guides synced; own QA resources cleaned, generated config diff-clean; empty migrated QA DB retained. Evidence: `task-assignee-verification.md`.

## UX-1a — COMPLETE, local functional acceptance

Only branch-delete linked-data precheck/read-only Owner warning; no new delete
UI. Parent: 315/315 full unit, 16/16 focused, clean typecheck/build, 9/9 real
HTTP/PG on dev AND compiled app (includes exact cleanup). Owner linked/empty
browser checks, Hinglish warning, narrow Branch Admin absence and PostgreSQL
no-write readback passed; 390px geometry checked, no pixel-level claim. Own
QA resources cleaned; config diff-clean. Independent scoped review
`deleg_79df9d8b` passed without blockers and independently ran 16/16 focused
tests. Suggested explicit branch-list loading/error and Owner-grant transition
tests remain nonblocking follow-ups.
Evidence: `branch-deletion-verification.md`; contract:
`branch-deletion-contract.md`. Do not call all of UX-1 done after this slice.

## UX-1b — COMPLETE, local functional acceptance

Authorized exact-ID historical lookup for approved indents and finalized FAIL/PARTIAL
GRNs (Purchase PO dialog + Vendor Returns panel), plus exact-ID GRN quality
unknown-outcome recovery, replacing the latest-200-only discovery gap. No
financial posting, grant widening, or stock/settlement logic change. Parent:
357/357 full unit, 123/123 focused across 7 files, clean typecheck/build,
34/34 real HTTP/PG on dev AND compiled app (>200-row list-hiding, every
permission/branch/query-shape denial, no-write readback, idempotent replay,
immutable claim amounts). Browser: historical indent locked-quantity lookup
and historical finalized-GRN claim registration both verified end-to-end with
exact PostgreSQL readback. Independent review passed with 2 nonblocking
stylistic suggestions. Own QA resources cleaned; config diff-clean.
Evidence: `historical-purchase-lookup-verification.md`; contract:
`historical-purchase-lookup-contract.md`.

## UX-1c — COMPLETE, local functional acceptance

Clone Branch Wizard: Owner-only, atomic copy of menu items/BOM recipes
(HQ-lock preserved, components rewired to the new branch)/branch-owned
checklist templates from an existing branch; global templates and all
other data (stock/users/vendor rates/recurring tasks/orders) never copied.
Parent: 398/398 full unit, 31/31 focused (no sibling regression), clean
typecheck/build, 11/11 real HTTP/PG on dev AND compiled app. Browser clone
-> reload -> exact PG readback passed. Independent review passed, no
blockers. Own QA resources cleaned; config diff-clean.
Evidence/contract: `ux1c-automation1a-verification.md`,
`clone-branch-wizard-contract.md`.

## AUTOMATION-1a — COMPLETE, local functional acceptance

Real authenticated (bearer CRON_SECRET only, never session/cookie)
recurring-occurrence generation + 30-minute overdue escalation, bounded/
idempotent via existing unique indexes and a WHERE-guarded update. No
WhatsApp/message-sending code anywhere in this slice. `vercel.json` crons
entry added, not deployed. Parent: 398/398 full unit, 41/41 focused, clean
typecheck/build, 7/7 real HTTP/PG on dev AND compiled app (idempotency,
exact 30-min boundary, concurrent-tick no-duplicate). Browser cron POST ->
generated task visible on /tasks confirmed. Independent review passed, no
blockers. Own QA resources cleaned; config diff-clean.
Evidence/contract: `ux1c-automation1a-verification.md`,
`automation-1a-contract.md`. Message-sending (8AM summary, escalation
alert, expiry alert) and indent spike/rolling-average data remain separate
AUTOMATION-1b/1c follow-ups, not done here.

## SECURITY-1 — drizzle-orm half COMPLETE, Next.js half still open

Upgraded drizzle-orm 0.36.4->0.45.4 and drizzle-kit 0.28.1->0.31.11 (closes
the HIGH SQL-injection advisory H1); no code changes needed, confirmed via
clean typecheck, 398/398 unit, "no schema changes" from drizzle-kit
generate, clean isolated build, and 34/34 real HTTP/PG checks through the
actual app (not just a raw driver ping). Next.js 15->16 (closes H3's
transitive postcss advisory) deliberately deferred to its own pass — too
large to safely bundle with this session's uncommitted feature surface.
Evidence: `security-1-drizzle-upgrade-verification.md`.

## Still open

- FINANCE-1: source-event debit/credit, reversal, historical posting and authority rules must be agreed before implementation. Current petty-cash IN conflates HQ top-up/refund; OUT has no accounting category; aggregator rows do not prove payout or new revenue. Never guess their journal mappings. Awaiting user-supplied rules.
- FINANCE-2: historical actual COGS/labor allocation and P&L accounting sources/rules, not current-rate recipe estimates.
- AUTOMATION-1b/1c: WhatsApp message-sending automation (8AM summary, escalation/expiry alerts) and indent spike/rolling-average data — separate approval/business rule needed; AUTOMATION-1a's generation/escalation core is done (above).
- EVIDENCE-1: user approved Vercel Blob Storage; awaiting the user to create a Blob store and supply `BLOB_READ_WRITE_TOKEN` before implementation starts.
- PURCHASE-3: invoices/three-way matching/physical return/vendor acceptance/actual settlement. User said skip for now.
- SECURITY-1: drizzle-orm/drizzle-kit upgrade done (above). Next.js 15->16 major upgrade still needs its own dedicated pass.
- UX-1 remainder: Clone Branch Wizard done (above, UX-1c). Historical selector pagination done for Purchase/GRN (UX-1b); broader desktop/laptop/tablet/mobile/pixel acceptance across the rest of the app remains open.

GRN-2 baseline is committed locally as HEAD `8856d94`; this session has not verified its production deployment. Preserve that distinction rather than repeating CLAUDE.md's older uncommitted wording.
