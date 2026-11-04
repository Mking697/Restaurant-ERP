# GAP-025 — local verification and release boundary

Status: DONE for the owner-approved internal-document scope; production schema, pushed feature SHA, Vercel Ready/public alias binding and authenticated read-only browser/API smoke are verified. Release record: `gap025-release.md`.

## Release review checkpoint

Owner subsequently explicitly approved commit/push, production migration and deployment in the release clarification. That later approval supersedes the original local-only authorization; it does not waive safety gates.

Initial independent review found two blockers: full POS-page unmount/remount losing uncertain intent and partial-fixture setup deleting an uncaptured setting. Both now have failing-before/passing-after regressions and independent PASS re-reviews. Current full suite: 646/646; TypeScript/Drizzle pass; complete final build log, fresh BUILD_ID/route manifests and compiled runtime verified. Real HTTP/PostgreSQL: 178 checks, GAP-023 compatibility 275, GAP-024 compatibility 648, each with cleanup pass. Fresh/legacy/no-op migration: 25 checks.

Real browser POS -> Guide -> POS navigation retained exact proforma intent and blocked new writes; real 201 acknowledgment was intentionally dropped after commit, identical replay returned real 200/same document. Readback: one new proforma and unchanged order/line/receipt/stock/lot/movement fingerprint. Recovery is browser-realm only: no hard reload, closed-tab or browser-restart persistence claim. No credentials/customer snapshots or persistent browser storage added.

Current retained evidence: `gap025-evidence/gap025-final-fixed-tests.log`, `gap025-final-fixed-build.log`, `gap025-final-http.log`, `gap025-final-compat-023.log`, `gap025-final-compat-024.log`, `gap025-final-browser-remount.json` and `gap025-final-browser-db.json` (all under that evidence directory). Older 635-test/browser artifacts below remain historical proof.

Production migration was authorized and applied atomically under existing advisory lock with exact database/40-row ledger/watermark/absent-schema guards. All historical committed-LF hashes matched ordered-prefix digest `62bad5f1d943af056597c416860be360`; original ledger digest `bbf631936adaf6a6bfb66899a18111e2` preserved. Branch/menu/order/line/receipt/draft fingerprints unchanged inside transaction. Independent readback: 41 migrations; candidate SHA256 `3d03457c0d1b1a2ed48dec6a45b735ef53953b5057f368188ca67b68c84ef8ca`, timestamp `1793790465948`; document/request tables and two nullable snapshot columns exist; no generated documents/requests, sequence uncalled at 1, production orders/receipts still zero. Tracking row inserted in the same transaction so Git-triggered migrate does not replay DDL. Target: Neon `wild-glade-34334923` / `br-plain-poetry-a1151jyf` / `neondb`.

Release gates completed: feature commit `48c7f85a327e6ee480d50cee8e58c850fd3f0970` matches remote main; Vercel `dpl_4AQyPcf1VuXnkmZS37DSXzMndkYT` READY and public alias/source binding verified. Authenticated read-only documents/lifecycle/orders, absent-target 404, anonymous 401 and hydrated POS panel passed. Temporary production session deleted/read back absent and browser cookie cleared/read back absent. Independent post-smoke counts: 41 migrations; orders/receipts/drafts/documents/requests all zero. No production business fixtures. Actual production artifacts: `gap025-production-deployment.json`, `gap025-production-smoke.json`. A later documentation-only HEAD/deployment is verified separately rather than recursively rewriting this record.

A subsequent release build compiled but its TypeScript/page-data phase exceeded the tool deadline and ended with EPIPE; it is not a successful release build. The earlier successful build listed below remains historical local evidence only.

## Delivered

- Immutable persisted draft/open-order proformas, source revision checks, canonical request replay and permanent PF/INV identities with EAT year and a global non-resetting sequence.
- Exactly one FINAL within the existing full-payment transaction, linked to order/receipt and an applicable proforma. No second sale, stock deduction, COGS or payment event.
- Captured line identity, prices, effective VAT, totals, tender FX, seller and source context. Reprints read saved evidence rather than rebuilding it from today's menu/settings. Legacy unknown line identity stays NULL/unavailable; no historical document backfill.
- Cashier-only branch/privacy-protected history and invoice-only preview/print; kitchen permissions do not grant financial-document access. Uncertain proforma acknowledgments remain locked through later rejection until exact successful resolution.
- VAT-summary reader prefers the issued FINAL snapshot without changing approved rates or posting duplicate financial amounts. Guide and regression tests updated.

## Executed gates

| Gate | Result | Retained evidence |
| --- | --- | --- |
| Full DB-free suite after final preview-button change | 635/635 pass, zero skipped | `gap025-evidence/gap025-full-tests.log` |
| Production Next build with TypeScript | Pass | `gap025-evidence/gap025-build.log` |
| Standalone TypeScript after removing temporary QA build-path edits | Pass | Same-session terminal output |
| Compiled HTTP/PostgreSQL GAP-025 suite | 178 checks pass | `gap025-evidence/gap025-http.log` |
| Existing GAP-023 HTTP/PostgreSQL compatibility | 275 checks pass | `gap025-evidence/gap025-compat-023.log` |
| Existing GAP-024 HTTP/PostgreSQL compatibility | 648 checks pass | `gap025-evidence/gap025-compat-024.log` |
| Drizzle consistency and generation | Pass; no further schema changes | Same-session terminal output |
| Browser unknown acknowledgment -> later rejection -> exact resolution | First real 201 was intentionally dropped after commit; a later local 409 was injected; final real 200 returned the same document with byte-identical request bodies. Exactly one new proforma in DB | Browser tool transcript; actual proforma screenshot `gap025-evidence/01-proforma-replay-confirmed.png`; DB readback below |
| Browser saved FINAL print | Real built-app Print/reprint action generated an invoice-only frame with saved item/code/quantity/prices/VAT/totals and linked order/receipt/proforma; no alerts or dashboard content | Actual generated `gap025-evidence/02-final-print.html` and `gap025-evidence/03-browser-print.json` |
| Financial readback after browser issue/replays/print | Exact order/receipt/ticket/line/stock/lot/movement fingerprint unchanged; one new proforma, no new FINAL/receipt/payment/stock | `gap025-evidence/04-browser-db-readback.log` |
| Working diff whitespace check | Pass | Same-session terminal output |

The injected dropped response and 409 are deliberate browser-only failure simulation, not claimed backend responses. The 201/200 and final database identity/readback came from the real isolated server/database. Initial proforma screenshot predates the small, subsequently tested preview-button spacing/border fix.

Migration candidate is additive `0040_gap025_pos_documents.sql`. Fresh/legacy/no-op migration test is `tests/gap025-migration.integration.cjs`; its 40-migration baseline guard must not be bypassed to rerun it against the already-upgraded fixture. Do not change committed historical SQL bytes or tracking timestamps. Production lineage/watermark must be independently rechecked before any separately authorized migration.

## Isolation and remaining limits

- All business fixtures and browser writes used the isolated local QA PostgreSQL instance at `127.0.0.1:5442`, database `restaurant_erp_gap025_qa_20261104`, and compiled app at `http://localhost:3125`. No production business writes or provider sends are part of this slice.
- TIN/VRN remain null/unverified, and all output says INTERNAL SALES DOCUMENT — NOT A FISCAL RECEIPT. No TRA/EFD integration or legal-compliance claim.
- Real browser print action and generated invoice-only content were verified. Physical printer/OS spooler delivery is NOT verified. A post-print screenshot capture timed out; the HTML and JSON were written before that capture failed. Do not claim a final screenshot exists.
- No split/partial payment, automatic refund/restock, historical mass conversion or changed tax rules.
- Owner-approved schema and application release completed; details in `gap025-release.md`. Protected CLAUDE.md checkpoint update was blocked by an expired approval prompt and was not retried or bypassed; this report and gaps.md are current.
- Test server/session cleanup and stopped-container readback are recorded in `gap025-evidence/05-cleanup.log` after teardown. The stopped disposable QA database is retained for inspection, not deleted.
