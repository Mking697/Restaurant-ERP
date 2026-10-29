# GRN-2 vendor claims — local verification, October 29, 2026

Status: COMPLETE within the contracted local functional scope. Parent functional gates and independent scoped review passed. Baseline `8f90d8b`; changes remain local, uncommitted and undeployed. This is not full invoice/settlement/finance or whole-ERP acceptance. After renewed user authorization, the protected CLAUDE.md update succeeded and GRN-2 is marked COMPLETE — LOCAL FUNCTIONAL ACCEPTANCE.

Contract: `docs/grn-vendor-returns-contract.md`.

## Behavior

New FAIL/PARTIAL quality decisions create immutable per-failed-line vendor return/refund claims in the SAME quality/stock/audit transaction. Existing trusted GRN-1 failures have explicit once-only registration. Legacy/unverifiable quality or partial/conflicting claim history fails closed; replay does not repair it. New quality receipt version marker requires consistent claims on replay; old quality replays remain no-write.

These are EXPECTED refund/credit claims at saved PO-rate value, not proof of physical return, vendor acceptance, actual money received or settled credit. Failed quantities are not deducted from stock a second time. No cash, petty-cash, bank payment, journal or invoice tax adjustment is invented. Settlement remains separate PURCHASE-3/FINANCE scope.

Existing material_returns and audit_log are used without schema/migration changes. Deterministic return IDs and batch receipts serialize under the existing mutate lock; exact thousandths × rate paise are half-up rounded once per line. All rows and the receipt roll back together if any late insert/receipt/capacity validation fails.

Purchase exposes Vendor returns under PURCHASE_ORDER. Accounts exposes a read-only Vendor refunds tab under new VENDOR_REFUNDS; no automatic grants, Purchase authority, user administration or expense posting is granted. Accounts navigation/page/guide access includes that new permission. Bilingual app/offline guides are synchronized.

## Parent evidence

- Full `npm test`: 283/283 passed, zero failures/skips (captured final unit log).
- Combined focused component suite: 59/59 passed (new vendor-return UI plus unchanged-behavior purchase/GRN-1 cases). Four policy/permission regressions and bilingual guide/parity regressions also passed.
- Project `npx tsc --noEmit --incremental false`: clean before/after final QA config restoration.
- Optimized Next build in isolated `.next-returnsbuild-20261029`: completed with BUILD_EXIT=0; routes for claims/Accounts compiled. An earlier foreground chained gate timed out without an acceptance result. The build was then rerun with an owned background job and captured log; exit 0 was explicitly read back. Do not treat the earlier timeout as a pass.
- Both dev `127.0.0.1:4331` and compiled `next start` `127.0.0.1:4332`, bound to guarded loopback database `restaurant_erp_purchase_qa_20261029`:
  - vendor-returns.integration.cjs: 31/31.
  - grn-quality.integration.cjs: 34/34.
  - purchase.integration.cjs: 50/50.
- Real GRN-2 cases cover automatic and historical claims, exact rate/rounding, PASS/general behavior, replay/concurrent writer election, old-version no-write replay, receipt corruption/missing rows, legacy refusal, Accounts-only reads/page admission, no extra permissions/DTO secrets, branch/filter/replay denial, auth/CSRF/unknown fields, read-only Accounts method, forced late-line and claim-audit failures, capacity rollback and no invented journal/cash entries.

## Real compiled-app browser

Disposable Owner and VENDOR_REFUNDS-only Accounts sessions were created in QA, with opaque cookies rather than passwords. Three direct-SQL GRN fixtures represented new pending quality, trusted historical GRN-1 failure, and unverifiable legacy failure. This is not a claim of browser-created POs.

- At 1440x900, saved two-line PARTIAL quality: rice failed 2.125 kg, oil failed 0.500 l. Vendor returns immediately showed two persisted expected claims, INR 21.78 and INR 50.00, without a separate stock deduction.
- At 390x844, selected the trusted historical failure and clicked Register failed-quantity claim. Server-confirmed readback/reload showed four cards. Legacy failure was not selectable. Page width exactly 390, no horizontal document overflow.
- Switched to VENDOR_REFUNDS-only Accounts user: exactly Vendor refunds tab, Accounts sidebar link, no Purchase link or registration controls. Four same saved claims survived full reload. Hinglish disclaimer and preferences were exercised.
- Independent PG assertions: four claim rows with amounts 21.78, 50.00, 21.78, 50.00; two GRN_VENDOR_RETURN_RECORDED receipts; final oil stock 4.500 and rice stock 7.875; journals=0 and petty cash=0. Historical registration did not alter accepted stock.
- Screenshots were captured, but this acceptance is based on actual DOM/actions, geometry and PG readback. No exhaustive pixel-level/device visual acceptance is claimed; UX-1 remains separate.

## Cleanup and remaining gate

QA cookie cleared BEFORE fixture cleanup. Exact browser fixtures removed and read back empty. Sixteen inspected business/auth/claim/finance tables in the disposable database were empty; migrations remain 11 and temporary QA triggers zero. Only owned QA servers were stopped, ports 4331/4332 verified free, own dev/build output and scratch fixture/session files removed. Default tsconfig.json/next-env.d.ts references are diff-clean. Existing local container/database and unrelated processes preserved.

Independent scoped review `deleg_b25c8f66` passed with no blocking security or logic findings. Reviewer independently ran 64/64 focused tests and 8/8 GRN policy tests; inspected but did not rerun HTTP/Postgres/build gates. Parent reran the combined focused inventory: 72/72 passed, plus final project typecheck, generated-config diff and whitespace checks. Narrow static scan of 21 changed/new source/test files found no literal credential or dynamic-execution matches.

Nonblocking suggestions: temporary generated references were already removed and verified diff-clean by parent after the review snapshot. Historical registration candidates inherit the GRN endpoint's latest-200 discovery limit; pagination/authorized lookup or clearer selector-specific disclosure remains a UX follow-up. An absent selector option is not proof that no older failure exists. Exact-GRN API registration/read recovery is not restricted to the latest-200 claim list.


## Authorized release verification — October 29, 2026

User explicitly authorized commit, push and deployment of completed accepted work,
and requested all eight remaining-work categories stay recorded in CLAUDE.md.
This is an application-only release: no schema, migration or dependency edits.
The pending features are not being implemented as part of this release.

Fresh parent release gates on the GRN-2 application tree:
- Full unit suite: 283/283 passed, no failures/skips.
- Project typecheck: clean; isolated production build completed with exit 0.
- Fresh compiled app on loopback port 4341 / guarded disposable database
  restaurant_erp_purchase_qa_20261029: vendor claims 31/31, GRN quality 34/34,
  purchase 50/50 real HTTP/Postgres checks passed.
- Fixture cleanup readback: branches/users/sessions/GRNs/material returns/POs/
  inventory/journals/petty cash empty; temporary qa_ triggers zero.
- Default tsconfig.json and next-env.d.ts restored and diff-clean; final
  project typecheck clean. Narrow static scan: 21 source/test files, no matches.
- Fresh Neon read-only preflight at 2026-10-29T12:53:55.283Z: all 11 ordered
  migration timestamps and LF-normalized SHA-256 hashes matched; required
  security columns present. No pending migration. Baseline: 6 branches, 1 user,
  12 inventory rows, zero POS orders, purchase orders and GRNs.

Fresh independent pre-release review `deleg_4d8ed62a` passed with no blocking
security or logic findings. Its generated-type-path suggestion was already
resolved by parent; both generated config files are diff-clean against HEAD.
Reviewer performed source review only, not another test/build/database run.

Deployment verification will be appended only after the exact pushed SHA is
READY, the public alias matches, public smoke passes and read-only postflight
has completed. No authenticated production workflow, fixtures or messages are
included in this release authorization.
