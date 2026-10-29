# GRN-1 local acceptance — October 29, 2026

Status: COMPLETE within the local functional scope of `docs/grn-quality-contract.md`. Changes remain uncommitted and undeployed on top of `5686996`. This is not whole-ERP acceptance or a production release.

Tracker update: after the initial protected-file approval timeout, the user explicitly requested another approval attempt. The approved write succeeded; `CLAUDE.md` now marks GRN-1 COMPLETE — LOCAL FUNCTIONAL ACCEPTANCE. Production deployment and the separate remaining roadmap items are still pending.

## Implemented and verified

- Every GRN line is returned and shown with received, failed and accepted quantities in its own unit. PASS/FAIL/PARTIAL, note/reference and per-line failures persist after reload.
- POST `/api/purchase/grns/[id]/quality` binds the complete line set to the persisted GRN/PO/branch. Strict allowlists and exact integer-thousandths arithmetic reject invalid or substituted quantities.
- One existing locked transaction commits accepted-stock credits, all failed quantities, final quality/status and deterministic audit receipt. Identical normalized replay returns the saved result without another credit; conflicting replay returns 409. Live branch/module checks apply even to replay.
- Newly received POs get a transactionally created GRN origin marker. Old PENDING or finalized GRNs without trustworthy evidence require reconciliation; PENDING alone never authorizes reposting.
- Unbound `/api/inventory/receive` returns 410 to authorized legacy callers and cannot bypass GRN admission. General purchases save quality without stock. Store quality requires PURCHASE_ORDER and INVENTORY; no grants were widened.
- UI freezes an unknown-outcome intent, offers explicit read recovery/exact replay, prevents same-tick duplicate submission and suppresses stale completions after identity/grant changes. No automatic POST retry.
- App/offline English and Hinglish purchase guides and control copy reflect the new behavior. Vendor returns/refund receivables remain GRN-2; no cash receipt, journal or uploaded evidence is invented.

## Adjacent stock-transfer bugs closed

The bounded related-path audit found omitted `qtyReceived` silently finalized a zero receipt and duplicate destination stock rows arbitrarily credited one row. Real HTTP regressions reproduced both before fixes. Capacity overflow also reproduced as generic 503; it now returns 409 and preserves the transfer/stock. Receipt parsing now requires an explicit quantity, rejects unknown/invalid fields and uses exact thousandths for credit/variance. Explicit zero and overdelivery remain supported. Concurrent receipt still finalizes once; subsequent requests receive 409 (not a new transfer replay protocol).

## Parent-executed gates

- `npm test`: 247/247 passed, zero failures/skips. Includes 24 GRN UI/component regressions, eight GRN policy regressions, existing approved-indent UI tests and bilingual guide/parity regressions.
- `npx tsc --noEmit --incremental false`: clean, including after restoring default generated-type references.
- `NEXT_DIST_DIR=.next-grnbuild-20261029 npm run build`: clean optimized build. Isolated output preserved the separate dev server.
- Real HTTP/Postgres suites passed serially on BOTH dev (`127.0.0.1:4321`) and compiled `next start` (`127.0.0.1:4322`), bound to loopback database `restaurant_erp_purchase_qa_20261029`:
  - `tests/grn-quality.integration.cjs`: 34/34.
  - `tests/purchase.integration.cjs`: 50/50.
  - `tests/stock-receive.integration.cjs`: 15/15.
- GRN coverage includes PASS/FAIL/PARTIAL/general, all lines, exact duplicate-material aggregation, equivalent/conflicting concurrent replay, live replay permission removal, anonymous/CSRF/grant/branch denial, legacy origin/receipt absence, duplicate stock, later-line capacity overflow, forced line-write failure and forced audit-receipt failure. Committed stock/lines/GRN/audit readback proves rollback.
- Transfer cases include omission versus explicit zero, duplicates, overflow, decimal precision/par preservation, invalid fields/quantities, auth/CSRF, concurrency, overdelivery with `-0.001` variance and first-stock-row creation.
- A verification fixture collision on globally unique blank vendor phone was a harness isolation issue, not an application failure. The GRN harness now uses a run-unique synthetic vendor key; reruns passed with unrelated browser fixtures present and preserved.
- `git diff --check`: clean apart from informational Git LF/CRLF conversion warnings. Application schema, migration chain and dependency manifests are unchanged.

## Real compiled-app browser acceptance

Disposable Owner and PURCHASE_ORDER-only buyer sessions were generated in the QA database; no password or production account was used. Five synthetic GRNs were prepared directly as QA fixtures, including trusted origins for new records and one deliberately ambiguous legacy record. PO creation/receive/origin wiring is separately exercised by the real purchase HTTP suite; these browser fixtures are not a claim of browser-created POs in this pass.

- At 390x844, saved a two-line PARTIAL: rice received `10.000 kg`, failed `2.125 kg`, accepted `7.875 kg`; oil received `5.000 l`, failed `0.500 l`, accepted `4.500 l`. Missing failure note disabled Save; valid note/reference enabled it. Server-confirmed row showed persisted quantities and Posted.
- Fresh navigation/reload retained the same decision, quantities, note/reference and no repeat action. Phone document width was exactly 390.
- At 1440x900, saved store PASS and FAIL; FAIL required a note and showed QUALITY_HOLD with full failed quantities and no stock posting. Desktop document width did not exceed the viewport.
- PURCHASE_ORDER-only buyer saw disabled store-quality controls with INVENTORY prerequisite, but saved a general-purchase PASS using Hinglish controls without inventory posting. Legacy row showed reconciliation and no quality action.
- Final reload showed four final decisions and the blocked legacy record, with zero repeat-action buttons. Independent PostgreSQL assertions confirmed exact final stock: rice `17.875`, oil `9.500`; four quality receipts, four creation origins, and all final line failures/statuses.
- English in-app purchase guide dialog and Hinglish guide card checked; standalone guide opened in both languages with saved-quality, recovery and deferred-refund guidance. Automated deep-equality tests cover full app/offline data parity.

Visual limitation: a phone screenshot was captured, but image analysis failed with provider/model 404. DOM interactions and geometry are verified; pixel-level/multi-device visual acceptance is NOT claimed and remains UX-1.

## Independent review

Reviewer batch `deleg_c2f51ad2` passed the bounded application diff, including untracked source/tests: no blocking security concerns or logic errors. Reviewer independently ran 32/32 GRN policy/component tests; inspected, but did not independently execute, HTTP/Postgres suites. Documentation/guide edits were outside that application verdict and are covered by parent guide tests/browser checks.

Both nonblocking suggestions were applied: corrected the stale PO-receive comment and added overdelivery/first-stock regressions. Subsequent changes were comments, documentation and test isolation/coverage, not additional application behavior.

## Cleanup and release boundaries

- Exact browser fixtures removed and reread absent; all 15 inspected business/auth/fixture tables in the disposable database were empty. Eleven existing migrations remain; temporary QA triggers count zero.
- QA cookie/scratch session removed. Own ports 4321/4322 verified free; own dev/compiled output directories removed. Default `tsconfig.json` and `next-env.d.ts` references restored and diff-clean.
- Existing local DB/container and unrelated processes preserved. Pre-existing post-release documentation preserved.
- No new application schema/migration/dependency change, production data operation, external message, commit, push or deployment. Production still serves the earlier release.
- GRN-2, TASKS-1, finance/automation/evidence, invoice/matching, security upgrades and remaining UX work stay open. This review does not establish that the rest of the ERP is bug-free.
