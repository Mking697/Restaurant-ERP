# GAP-021 / GAP-022 verification and production release

Date: 2 November 2026. Status: **VERIFIED_LOCAL with production release completed**, active pending formal tracker closure.

## Delivered behavior

- RAW replenishment triggers below configured minimum and targets maximum. Positions use eligible/reconciled branch lots, per-open-PO ordered-minus-received quantities, quality-pending receipts, approved internal remainder and linked transit exactly once, plus pending request reservations.
- Proven central stock is allocated first after central commitments. kg/ltr retain three decimals; pcs/count total rounds up and internal allocation rounds down to whole pieces. Conversion creates only an unapproved SUBMITTED internal requisition and a DRAFT external indent.
- Exact actor-bound key replay follows authorization, stale positions return 409, rejected/cancelled demand can start a genuinely new cycle, and downstream failures roll back both requests and conversion links.
- Finalized GRN quality autoqueues immutable receipt/shortage evidence. EOD submission sends the exact client revision: missing revision returns 400; changed revision returns 409 rather than submitting unseen evidence.
- HO authority is implicit Owner or explicitly granted branchless CENTRAL_STORE_MGR only. Escalation requires a reason and remains unresolved until a later ACK. Queue reads/actions are audited. Unresolved filtering runs before the disclosed 300-subject queue bound.
- Unknown-outcome UI freezes competing intent, supports exact saved-record readback or explicit identical replay, and blocks synchronous conflicting clicks. Branch-keyed reorder panels discard late old-scope responses.

## Executed gates

| Gate | Actual result |
|---|---|
| `npm test` | 507/507 passed, zero failed/skipped |
| `node --test tests/gap021-022.test.cjs` | 7/7 passed |
| `node --test tests/stock-review-ui.test.cjs` | 4/4 passed |
| `tests/gap021-022.integration.cjs` against real production-built HTTP/PostgreSQL | 50/50 passed |
| Existing `tests/eod-stock-report.integration.cjs` on same disposable target | 34/34 passed |
| `tsc --noEmit --incremental false` | Passed |
| Isolated `npm run build` | Passed, production route artifact exercised with `next start` |
| `drizzle-kit generate` | No schema changes, nothing to migrate |
| `drizzle-kit check` | Passed |
| `git diff --check` | Passed |
| Fresh schema + upgrade proof | All 38 migrations applied to disposable PostgreSQL 17; a separate 0036-prefix legacy fixture upgraded through 0037 with exact stock values preserved and no invented new review/reorder rows; migration replay unchanged |

The HTTP suite covers replay/branch/actor authority, exact EOD revision conflicts, independent revisions, real GRN quality autoqueue/shortage/replay, open-vs-historical PO math with duplicate item lines, held lots, reconciliation, pending reservations, min trigger, genuine second cycle, whole pieces, same-key races, cross-branch central-capacity races, stale 409, forced downstream failure/full rollback, draft-to-PO reservation replacement, real linked-transit accounting, short receipt and cancellation. A fixture with 301 newer acknowledgments proves an older unresolved subject remains reachable.

### Test-first failures observed before fixes

- Unauthorized HO and reorder key replay returned 200; different actor replay returned 200.
- Missing/stale EOD revision returned 200.
- Historical closed PO receipts erased current outstanding supply; saved on-hand included held/expired lots.
- Fresh preview after conversion ignored pending requests; returning numeric positions reused an already-converted row.
- Central unreconciled lot/balance data remained convertible; fractional pcs routed as fractional internal/external quantities.
- Same-tick conflicting HO clicks and duplicate preview clicks issued two requests.
- Healthy stock above minimum generated an unnecessary max-fill request.
- 301 newer acknowledged subjects hid an old unresolved exception.

## Real browser and SQL proof

Browser used the disposable local app, not a mock UI:

1. Inventory preview showed pcs need 4.000, internal 2.000, external 2.000. Actual Create reviewed requests was clicked with a deliberately dropped *committed* response. Competing intent froze; Check saved results read the exact persisted suggestion and rendered its requisition/indent IDs. One conversion was sent. Fresh preview did not duplicate its demand. Healthy above-minimum stock was absent.
2. A delayed old-branch preview was released after selecting another branch; it did not populate the replacement branch panel.
3. EOD Generate was clicked. While r1 stayed displayed, server regeneration created r2. Actual Submit sent r1 and displayed the revision conflict. Actual Regenerate then Submit sent r3. SQL showed the previous-day review subject only at r3, not unseen r2.
4. GRN Escalate was clicked with a deliberately lost committed response. Reason/action/branch/filter froze. Exact replay sent identical action/key/reason and created no second event. Escalation remained in the unresolved queue; a later actual Acknowledge removed that exact GRN. SQL retained one ESCALATE and one ACKNOWLEDGE with Owner actor and the original reason.
5. The updated offline SOP rendered its new module, expanded its real instructions and filtered Verified local to one matching module. Its header now accurately reports 21 module SOPs.

Selected screenshots are in the local scratch directory:

- `C:/Users/hp/AppData/Local/hermes/cache/scratch/gap2122-reorder-browser.png`
- `C:/Users/hp/AppData/Local/hermes/cache/scratch/gap2122-ho-browser.png`
- `C:/Users/hp/AppData/Local/hermes/cache/scratch/gap2122-sop-browser.png`

Some screenshot attempts timed out in the browser harness; live DOM assertions and action/SQL readbacks succeeded, and later screenshots succeeded. Jev chooser reported `no_key` and failed open; no private data or credentials were sent to it.

## Evidence files

Repository tests: `tests/gap021-022.integration.cjs`, `tests/gap021-022.test.cjs`, `tests/stock-review-ui.test.cjs`, and the existing EOD integration (extended only to permit this exact guarded disposable target).

Local scratch logs: `gap2122-production-http.log`, `gap2122-production-http-repeat.log`, `gap2122-eod-regression.log`, `gap2122-full-tests.log`, `gap2122-build.log`, `gap2122-drizzle-generate.log`. The upgrade proof script is `gap2122-upgrade-proof.cjs` in the same scratch directory. These contain synthetic QA data, not production credentials.

## Scope, release and tracker boundaries

- Suggestions target RAW materials only. Existing prepared min/max and manual mixed requisitions remain their own flows; automatic prepared replenishment is not claimed.
- `gaps.md` keeps GAP-021 and GAP-022 active as VERIFIED_LOCAL, with production release evidence recorded, until their coverage/limitations are formally closed. GAP-020 is separately DONE and moved to the Done register.
- Authorized release completed on November 2, 2026: feature commit `4547c18` was merged to production `main` revision `4981bb5fa4c9750ff30ab452657459bb0e179143`; Vercel deployment `dpl_7Vc1q4BAfWbEk4e1KESy7PGpdJJD` reached Ready at `https://restaurant-erp-tau.vercel.app`.
- Production Neon project `wild-glade-34334923`, branch `br-plain-poetry-a1151jyf`, has 38 migrations. Readback confirms `0036_regular_rhino`, `0037_far_nick_fury`, `eod_stock_reports`, `reorder_suggestions` and `ho_stock_review_subjects`. A pre-release rollback snapshot was created before migration; no rollback was required.
- Production smoke checks verified setup/login plus protected Inventory and HO routes without inserting synthetic production business records. No provider message, automatic purchase approval, PO placement or payment occurred.
- Cleanup verified: the exact QA server stopped gracefully; port 3119 has no listener; the `restaurant-gap2122-final-qa` disposable container/database is absent; its separate upgrade-proof database was removed; isolated `.next-gap2122-final` and `.next-gap2122-build` output and the disposable session-cookie fixture were deleted. Pre-existing listeners/containers on ports 5436 and 5438 were not modified.
