# Purchase release-blocker verification — October 29, 2026

## Scope and preserved baseline

Resumed `main` at `2a7cfc5` in `G:\restaurant erp`. Preserved the staged Phase 2/3 snapshot and interrupted unstaged purchase helpers/tests. No reset, clean, dependency upgrade, application-schema change, production write, commit, push or deployment was performed in this verification pass.

This is a bounded PO approval-binding repair, not acceptance of the entire ERP roadmap. The older Phase 3 evidence remains in `docs/phase3-verification.md`; its historical checks were not all rerun here.

## Reproduced defect and repair

The interrupted helpers `parseGeneralPurchase`, `parsePoIndentId` and `assertPoMatchesIndent` existed and passed unit tests, but the real POST did not call them. A guarded real HTTP/Postgres run reproduced 11 invalid cases: each returned 201 and persisted a PO, including missing/null/empty indent, absent/string/numeric kind, omitted/substituted material, excess/partial quantity and duplicate-splitting excess. The expanded suite was initially 34 passed / 11 failed.

The real orders POST now calls the helpers before any PO/line/status write, inside the existing locked mutation transaction. Store POs require a same-branch APPROVED indent and exact aggregate material quantities in integer thousandths; rates remain purchaser inputs. General POs accept descriptive lines without an indent or material link. No new partial-order allocation rule was invented.

The UI now chooses an approved indent for the selected branch, displays every material and locked approved quantity, and takes a rate per line. Switching branch or purchase kind clears the selected indent/rates. A separate read-only `/api/purchase/orders/approved-indents` endpoint uses PURCHASE_ORDER permission; it does not grant draft-indent reads, approval or user administration. POST revalidates choices under the mutation lock, including stale ones.

A real browser uncovered an obsolete translation claiming purchases were not saved. Both languages now explain the actual persisted, approval-bound behavior, protected by a translation regression. In-app/offline purchase guidance is synchronized; outstanding GRN warnings remain explicit.

## Parent-executed evidence

- `npm test`: **213/213 passed**, zero failed/skipped, after the final source/translation/guide edits.
- Focused purchase helper/component plus guide parity suite: **21/21 passed** (10 helper, 4 component/copy, 7 guide tests).
- `npx tsc --noEmit --incremental false`: clean, including final rerun after QA cleanup and restoring generated config.
- `NEXT_DIST_DIR=.next-purchase-resumebuild npm run build`: clean production build, including the new approved-indent route.
- `tests/purchase.integration.cjs`: **50/50 passed** against isolated `next dev`, and **50/50 passed** against the freshly compiled `next start` build. Separate executions, not 100 different acceptance cases.
- HTTP cases include committed-state no-write readbacks for all 11 bypasses; approved-choice reads and anonymous/foreign-branch denial; PO-only reads while draft read and approval remain denied; valid decimal duplicate aggregation; two simultaneous valid PO requests producing 201/409 and exactly one persisted PO; and a scoped line-insert failure proving PO/line/indent-state rollback. Existing purchase lifecycle and GRN-to-inventory handoff checks remain covered.
- Browser DOM workflow on the isolated QA app: chose approved two-line indent, entered Rice 10.000 kg at 60 and Oil 5.000 l at 100, submitted the real dialog, saw PO and PO_RAISED, reloaded and opened Purchase Orders via a real tab click: saved PO total **₹1,100** appeared. Independent Postgres readback verified the exact indent ID and both qty/rate rows.
- At 390px, browser innerWidth/document scrollWidth both measured 390 and both locked material lines/rate inputs existed. A screenshot was captured, but no pixel-level visual review is claimed. Browser automation had a recoverable navigation timeout and an early option-selection attempt before async choices finished loading; successful submission/reload evidence is from the later completed flow.

## QA isolation and cleanup

Docker Desktop was stopped and was started; its restart-policy containers auto-started, including unrelated apps. No unrelated container/server was intentionally modified or stopped. The existing `restaurant-erp-local-db` volume/container was preserved.

An older empty QA database `restaurant_erp_purchase_qa_20261028` had schema objects without a compatible migration history: migrator stopped at `type role already exists`. No schema objects/data were dropped to force that target through. Instead, created a new disposable loopback DB `restaurant_erp_purchase_qa_20261029`; the entire existing checked-in migration chain applied cleanly. No new application migration was generated or needed. The old QA target remains preserved for separate inspection.

After execution, suite fixtures, browser fixtures/session scratch JSON and temporary failure function/trigger were removed. Independent readback on the new QA DB returned users=0, branches=0, orders=0, grns=0 and QA failure functions=0. The migrated empty QA database is retained for reuse. Both own dev/production-mode QA servers were stopped; port 4319 verified free. Own `.next-purchase-resumeqa` and `.next-purchase-resumebuild` outputs removed. `tsconfig.json` and `next-env.d.ts` restored to default and `git diff --exit-code` confirmed them clean.

## Remaining gates

Independent scoped review **passed** with no blocking security or logic findings. The reviewer independently ran **14/14** focused DB-free purchase tests and read the integration additions; the reviewer did not rerun the real HTTP/Postgres suite. Nonblocking suggestion: paginate/fetch approved choices per branch beyond the current 200-row cap.

Fresh production preflight at **2026-10-29T06:40:38Z** used the existing authenticated Neon DEFAULT profile via pinned temporary CLI `neonctl@8.13.2` (no application dependency edits). Credentials stayed in process memory. A repeatable-read, read-only PostgreSQL transaction verified all 11 migration timestamps and LF-normalized SHA-256 hashes against the checked-in journal, plus `pos_orders.owner_only` and `login_attempts.blocked_until`. Counts were branches=6, users=1, inventory rows=12, POS orders=0, POs=0, GRNs=0. No pending migration or business write. Vercel CLI authentication/project and live alias verified; remote main still matched `2a7cfc5` before release.

Vercel `env run` could not provide a usable production Neon target (sensitive variables are hidden; running from the repo also loads local `.env`). Its fail-closed host assertion stopped before any DB access. Used Neon CLI instead; no credential export file, provider setting edit or application dotenv rewrite.

RELEASE-1 still requires the authorized commit/push/exact-SHA Vercel READY/public-smoke gates; independent review alone is not deployment.

GRN-1/2 are still open: quality decisions and stock-posting markers are page-local, repeat checks can duplicate stock, the current GRN presentation flattens lines, and vendor return/refund receivables are not implemented. These are not silently closed by this PO repair. Tasks assignee lookup, finance posting/actual COGS, automation, evidence storage, three-way match, dependency upgrades and remaining UI acceptance retain the tracker boundaries.
