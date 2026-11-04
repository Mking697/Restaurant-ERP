# GAP-025 — production release

Released for the owner-approved internal PROFORMA/FINAL document scope, November 4, 2026. Owner explicitly approved commit/push, production migration and deployment.

## Source and deployment

- Feature commit, pushed and independently matched to origin/main: `48c7f85a327e6ee480d50cee8e58c850fd3f0970`.
- Git-triggered Vercel production deployment `dpl_4AQyPcf1VuXnkmZS37DSXzMndkYT`: READY. Official deployment API resolved `restaurant-erp-tau.vercel.app` to this exact SHA, expected project `prj_CHWg05dn2VJ9TkYm22ADPf334Dx0` and production target.
- GitHub commit status: Vercel success. Check-runs endpoint returned zero check runs; this was not misreported as absence of a deployment.
- A subsequent documentation-only checkpoint can have a newer HEAD/deployment. Verify that final alias/SHA separately; this feature commit remains the application-change evidence. Do not recursively rewrite this report to contain its own commit SHA.

## Production database

Neon project `wild-glade-34334923`, branch `br-plain-poetry-a1151jyf`, database `neondb`.

All 40 historical SQL hashes matched immutable committed LF bytes. Historical tracking timestamps and complete ledger digest `bbf631936adaf6a6bfb66899a18111e2` were preserved. Candidate `0040_gap025_pos_documents` applied atomically under the existing application advisory lock, guarded by exact database/count/digest/watermark and absent candidate schema. Existing branch/menu/order/line/receipt/draft fingerprints stayed unchanged in the transaction.

Independent readback: 41 migrations; candidate hash `3d03457c0d1b1a2ed48dec6a45b735ef53953b5057f368188ca67b68c84ef8ca`, journal timestamp `1793790465948`; document/request tables and two nullable line-snapshot columns exist. Tracking row inserted in the same transaction; Git-triggered migrate did not add another row or replay the DDL. New tables empty and sequence uncalled at 1 after apply. No historical document backfill or financial data reconstruction.

## Verification

- Final full suite: 646/646, zero skipped. Standalone TypeScript, production build, Drizzle consistency and staged security/whitespace checks passed.
- Current compiled HTTP/PostgreSQL: 178 GAP-025 checks, 275 GAP-023 compatibility checks and 648 GAP-024 compatibility checks, all with successful scoped cleanup.
- Fresh/legacy/no-op migration: 25 checks pass.
- Two independent review blockers fixed with RED/GREEN regressions and separate PASS re-reviews: full POS-page unmount losing uncertain intent; partial fixture setup deleting an uncaptured branding setting.
- Real browser: committed proforma acknowledgment deliberately dropped, POS -> Guide -> POS retained original body/key and blocked new writes, exact real replay returned the same document. DB readback: one new proforma and unchanged financial/stock fingerprint. Invoice-only generated print output was separately exercised locally.
- Production authenticated read-only smoke bound the deployed app to the intended Neon DB using one short-lived session on an existing Owner identity. Documents/list, lifecycle and order reads returned 200; absent document returned 404; anonymous document read returned 401. Hydrated production POS displayed the internal document panel/disclaimer and recovery owner.
- Independent post-smoke database readback: orders, receipts, drafts, documents and document requests all remain zero; migrations remain 41. No production sale/payment/stock fixture, role/branch mutation or provider send was used.
- Temporary production session deleted by exact hash/user target and read back absent; production browser cookie cleared and read back absent. No raw token was printed or persisted. Disposable release QA server stopped and container removed; original stopped QA DB retained for inspection.

## Explicit limits

Documents say INTERNAL SALES DOCUMENT — NOT A FISCAL RECEIPT. Seller TIN/VRN remain null/unverified; no TRA/EFD integration or statutory compliance claim. Existing tax policy, payment/stock sequencing and receipt accounting remain unchanged.

Recovery survives SPA route unmount/remount in the same browser realm, not hard reload, tab closure or browser restart. No persistent browser storage/customer snapshots or credentials added. No physical-printer/spooler delivery, split payment, automatic refund/restock or provider delivery is claimed. One historical screenshot capture failed; actual print HTML/JSON was retained.

Evidence: `gap025-verification.md`, `gap025-release-preflight.json`, `gap025-production-deployment.json`, `gap025-production-smoke.json` and `gap025-evidence/`. Protected CLAUDE.md checkpoint update was blocked by an expired approval prompt and was not retried/bypassed; the current tracker and this release record supersede that stale checkpoint for GAP-025.
