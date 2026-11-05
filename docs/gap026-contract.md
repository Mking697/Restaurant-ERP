# GAP-026 — approved local implementation contract

Owner confirmed the exact six-point full-payment plan with "haa shuru kro" after reviewing it. Scope: implement and verify locally. No GAP-026 commit/push, production migration/deployment, provider send, tax-rule change, partial/split tender, overpayment/change or refund authorization. Baseline main `5d33461`, 646 passing tests. Preserve existing unrelated CLAUDE.md/process-map edits; protected CLAUDE.md update was previously blocked, so this contract/tracker are current.

## Business invariants

- Existing payment-first create/draft dispatch and Conventional full settlement are the ONLY collection writers. No new standalone payment action on already-paid FINAL. No input/API changes to existing write payloads. No repeated stock/COGS/revenue/receipt posting.
- Capture collection and one full allocation inside the same existing transaction, AFTER receipt and applicable FINAL issue and BEFORE saved acknowledgment. Capture actual collecting actor/name and settling shift/run, collection timestamp, order/receipt identity, amount/base TZS and original tender/FX. No customer snapshots or request key exposure. Preserve genuine zero-total sales; no arbitrary positive-only minimum.
- Add posOrders.paymentCaptured boolean default false; set true only for newly captured paid admission/full settlement in the same transaction. OPEN remains false until paid. Existing rows stay false, with no automatic historical event backfill. Missing/inconsistent ledger evidence for marked new rows fails closed, never falls back to an order projection.
- Existing legacy paid orders/receipts/FX are untouched and explicitly labelled legacy. A legacy OPEN collected after cutover gets genuine new collection evidence, even when missing historical name/tax prevents a verified FINAL. Its allocation then links the existing order/receipt with null final identity, not a fabricated document.
- New immutable pos_payments and pos_payment_allocations schema. One payment per order/receipt and one full allocation per payment/order/receipt enforced by unique indexes. Existing receipt number remains the public receipt identity; no second numbering scheme. Payment/order/receipt/final branch and amount identities validated. Use safe order/receipt cascading only for existing teardown semantics; branch/collector FKs must not silently erase cross-domain business records.
- Operational GET: POS_CASHIER, existing branch/current Owner-only privacy before limit, current authority under locked read. Kitchen-only denied. Actual shift custody includes private collections, preserving existing intentional cash-report disclosure policy.
- Shift close must derive tender rows from one shared collection seam: actual marked ledger rows plus explicitly legacy COMPLETED/PAID projections, never both. Verify captured full evidence, no silent missing-row undercount. Keep accepted counted physical-cash carry and period-only electronic totals unchanged. Closing cash report reads persisted closing drops/handover; do not recompute historical variances. Existing sale/revenue reports still count orders once, not payments as a second sale.

## Exact shared DTOs (pure types in NEW src/lib/pos-payments.ts)

Payment = { id, branchId, orderId, receiptId, receiptNumber, amount, tenderType, tenderCurrencyCode, tenderCurrencyAmount, fxRateToInr, collectorId, collectorName, shiftRunId, collectedAt:ISO string, sourceAction:'CREATE'|'SETTLE', finalDocumentId:string|null, finalDocumentNumber:string|null, allocation:{id,orderId,receiptId,finalDocumentId:string|null,amount} }.

PaymentOrderSummary = { id,branchId,orderNumber,status:'OPEN'|'PAID'|'COMPLETED',totalAmount,coverage:'OPEN'|'CAPTURED'|'LEGACY'|'UNAVAILABLE',collectedAmount:string|null,outstandingAmount:string|null,legacyRecordedAmount:string|null,unavailableReason:string|null,payment:Payment|null }.

- OPEN valid unpaid source: collected 0.00, outstanding order total, no payment. Standalone PROFORMA is not listed as debt.
- CAPTURED: one fully verified payment/allocation, collected equals billed, outstanding 0.00.
- LEGACY paid: new collection facts/collector are unavailable; collected/outstanding null, legacyRecordedAmount equals preserved paid order total. Do not display this as fresh verified collection or unpaid debt.
- UNAVAILABLE: missing/inconsistent marked evidence: collected/outstanding null, explicit reason; no invented zero/paid projection. Shift close must reject that corrupted evidence.

## HTTP and service seams

- NEW GET /api/pos/payments?branchId=<Owner optional>&orderId=<optional> -> {orders:PaymentOrderSummary[],visibilityScope:'actual'|'access-filtered',limit:200,truncated:boolean,legacyNotice:string}. Filter eligible OPEN/PAID/COMPLETED orders by current privacy/branch in SQL BEFORE limit; targeted foreign/private order fails without disclosure. Batch payment/allocation reads for bounded authorized IDs, no unbounded loads/N+1.
- Backend capture exported capturePosPayment(tx,actor,orderId,sourceAction) -> {payment:Payment}. Read saved receipt/order/FINAL; only PAID; enforce amount/branch/collector/source linkage. Guard repeat capture and canonical existing write replay. No standalone HTTP writer.
- Existing CREATE/SETTLE result adds optional `payment: Payment`; legacy cached acknowledgments without it remain valid. UI must not label the absence of an old cached field as a new unpaid outcome.
- Backend list exported listPosPayments(tx,actor,{branchId?,orderId?}) -> DTO above.
- NEW src/lib/server/pos-collections.ts exports readPosCollectionTenders(tx,branchId,shiftRunId) -> {tenderType:string,totalAmount:string}[] for shift close; use captured new amounts plus legacy fallback with no double count. Any marker/evidence mismatch throws HttpError409 before closing writes.

## Disjoint ownership

BACKEND writer owns: NEW src/db/schema/pos-payments.ts; existing pos.ts (paymentCaptured only), index.ts; NEW src/lib/pos-payments.ts, src/lib/server/pos-payments.ts, pos-collections.ts (+ optional pure pos-payment-policy.ts); existing pos-orders.ts and shifts.ts (capture/tender seam only); NEW src/app/api/pos/payments/route.ts; NEW tests/gap026-policy.test.cjs, gap026-service.test.cjs, gap026-collections.test.cjs as useful. May update minimal affected DB-free service mocks in gap023-service.test.cjs, gap024-service.test.cjs, gap025-service.test.cjs, shifts.test.cjs. NO UI/docs/integration fixtures/migration generation/dependencies/build/DB.

UI writer owns: NEW src/app/pos/payments-panel.tsx; existing src/app/pos/page-content.tsx (read panel, payment acknowledgment and refresh plumbing only); NEW tests/gap026-ui.test.cjs and minimal affected UI harness mocks if needed. Pure type imports only. Read-only payment/order history, collected/outstanding/legacy/unavailable coverage and receipt/FINAL/collector/shift/FX context. Reuse existing settle controls, never a second collect action. Preserve page browser-realm document quarantine and shared write locking. Refresh payment history after existing confirmed legacy/lifecycle mutations without feedback loops or remounting uncertain writes; visibility toggles refresh history. Clear rows on identity/branch/permission/read/refresh transitions; validate DTO scope/bounds and show empty/loading/error/truncation. NO server/schema/docs/integration/migrations/dependencies/build/DB.

PARENT owns contract/tracker/guide/offline copy, migration generation and QA, compiled integration/compatibility/migration/browser suites, independent review and merged gates, all production-read-only lineage discovery. Parent may fix uncovered sibling test harnesses only after writers return. Never stage/commit/push/deploy this gap without separate authorization.

## Gate discipline

All writers strict RED -> GREEN with actual focused output, existing installed Node/TypeScript only. Read local Next docs before code. Shared tree: never stash/reset/clean/pull/discard, no individual staging/commits, no replacing node_modules, no editing sibling-owned files. Parent sole build/migration owner. New QA target is explicitly loopback 127.0.0.1:5443 / restaurant_erp_gap026_qa_20261104; app localhost:3126; NEXT_DIST_DIR .next-gap026-qa. Inspect every existing integration runner guard before adapting it. Prove full-paid/new/legacy/zero/FX/two-shift attribution, exact replay/concurrency/failure rollback/privacy, native compiled API binding, browser read/refresh/quarantine behavior, and stock/COGS/payment/receipt row-count invariants. Full 646-test baseline must remain green; add new tests rather than weakening old expectations.
