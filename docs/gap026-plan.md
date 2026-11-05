# GAP-026 — proposed implementation plan

Status: IN_PROGRESS. Owner confirmed this exact full-payment plan with "haa shuru kro". Local implementation is complete and verified under `docs/gap026-contract.md`; see `docs/gap026-verification.md`. Production migration, commit/push and deployment remain separately unauthorized.

## Inspected current behavior

- `src/db/schema/pos.ts:148`: pos_receipts saves receipt identity/order/branch/time, not a separate captured collection and allocation record.
- `src/lib/server/pos-orders.ts:132`: payment-first create saves tender/FX and receipt, then immutable FINAL in the existing transaction.
- `src/lib/server/pos-orders.ts:207`: Conventional dine-in full settlement records the settling shift and receipt/FINAL without another stock/COGS posting.
- `src/lib/server/shifts.ts:153`: shift closing currently sums COMPLETED and PAID order tender projections, carries incoming counted physical cash, and does not carry electronic collections again.
- GAP-025 contract: FINAL is issued with full payment. An unpaid OPEN bill is not an unpaid issued FINAL. PROFORMA is an estimate, not an accounted receivable or payment.

## Proposed approved-scope candidate

1. Capture a durable collection event and allocation to the existing order/receipt and available FINAL, in the SAME existing create/full-settlement transaction. Capture amount/base TZS, actual tender currency/amount/rate, method, collecting actor, collecting shift/run, source action and timestamp. Full settlement only; no new payment on an already-paid FINAL. Preserve valid zero-total orders rather than inventing a minimum charge.
2. Reuse current New Order, draft dispatch and Settle order actions; no second independently mutating payment button or duplicated receipt identity. Retry returns the existing payment/receipt/allocation after live authority/privacy checks. Missing required new evidence rolls back the whole new-path admission.
3. Show saved payment/receipt history and order-to-FINAL linkage in POS, with billed/collected/outstanding coverage. OPEN conventional order has outstanding until full settlement; then paid/zero balance and FINAL. A standalone proforma does not become customer debt. Partial/split payment, overpayment/change handling, refunds and provider delivery remain outside this slice.
4. Use one shared collection read seam for affected shift-close/cash reconciliation consumers. Explicitly distinguish ledger-backed new rows from legacy order tender projections; never sum both. If a marked new-path collection is missing/incomplete, fail closed instead of silently counting the legacy projection again. Preserve current physical-cash carry and period-only electronic tender policy.
5. Preserve old paid orders/receipts/FX as legacy evidence. Do not fabricate a historical collecting cashier or allocation, or rewrite earlier paid totals. An old OPEN order collected after cutover may get the genuinely new collection event, while any missing historical FINAL snapshot remains explicitly unavailable.
6. Keep POS_CASHIER, branch and current Owner-only privacy rules. Operational history stays filtered; actual authorized cash/report accounting does not omit private collections. No new permission implicitly granted to Kitchen.

Example: a TSh 10,000 conventional bill opened in shift A stays unpaid. Full cash collection in shift B creates one payment/receipt/allocation and the applicable FINAL, records B's actual collector, credits only B's collection totals, and posts no second stock/COGS event. Exact retry adds nothing.

## Verification before local completion

Strict RED/GREEN tests; full suite and TypeScript/build; one parent-generated coherent additive migration after lineage check; fresh/legacy/no-op disposable migration proof; current compiled HTTP/PostgreSQL for payment-first/conventional flows, concurrency, rollback, authority/privacy, old-data coverage, captured FX, zero-total edge and shift A->B attribution; browser history/retry/unknown-response/route-remount checks; exact no-extra-stock/COGS/receipt/payment readback. Preserve unrelated existing worktree changes.

New schema/helper/API/UI seams above are PROPOSED until implementation approval. Exact HTTP DTOs/file ownership will be recorded in the implementation contract before parallel writers start. Generate/apply only against explicitly scoped disposable QA. Production changes and commit/push/deployment require a separate release approval; GAP-025's release authorization does not cover GAP-026.
